import * as path from 'path'
import * as vscode from 'vscode'
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from 'vscode-languageclient'
import {getOutmostWorkspaceURI, getExtension, generateGlobPatternFromExtensions, getTimeMarker} from './util'


process.on('unhandledRejection', function(reason) {
    console.log("Unhandled Rejection: ", reason)
})


let extension: CSSNavigationExtension

export function activate(context: vscode.ExtensionContext): CSSNavigationExtension {
	extension = new CSSNavigationExtension(context)

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('CSSNavigation')) {
				extension.loadConfig()
				extension.restartAllClients()
			}
		}),

		vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
			extension.checkClientForOpenedDocument(document)
		}),

		vscode.workspace.onDidChangeWorkspaceFolders(event => {
			for (let folder of event.removed) {
				extension.stopClient(folder)
			}

			// Even only removes a folder, we may still need to restart all servers for every folder,
			// because some client folder may be contained in removed folders.
			extension.checkClients()
		})
	)

	return extension
}

export function deactivate(): Promise<void> {
	return extension.stopAllClients()
}


interface InitializationOptions {
	workspaceFolderPath: string
	configuration: Configuration
}

interface Configuration {
	enableGoToDefinition: boolean
	enableWorkspaceSymbols: boolean
	enableIdAndClassNameCompletion: boolean
	enableFindAllReferences: boolean
	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alsoSearchDefinitionsInStyleTag: boolean
	preloadCSSFiles: boolean
	ignoreSameNameCSSFile: boolean
	ignoreCustomElement: boolean
}

export class CSSNavigationExtension {
	
	channel = vscode.window.createOutputChannel('CSS Navigation')
	private context: vscode.ExtensionContext
	private config!: vscode.WorkspaceConfiguration
	private clients: Map<string, LanguageClient> = new Map()	//one client for each workspace folder
	private gitIgnoreWatchers: Map<string, vscode.FileSystemWatcher> = new Map()

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadConfig()
		this.checkClients()
	}

	loadConfig() {
		this.config = vscode.workspace.getConfiguration('CSSNavigation')
	}

	private getConfigObject(): Configuration {
		let config = this.config

		return {
			enableGoToDefinition: config.get('enableGoToDefinition', true),
			enableIdAndClassNameCompletion: config.get('enableIdAndClassNameCompletion', true),
			enableWorkspaceSymbols: config.get('enableWorkspaceSymbols', true),
			enableFindAllReferences: config.get('enableFindAllReferences', true),
			activeHTMLFileExtensions: config.get('activeHTMLFileExtensions', []),
			activeCSSFileExtensions: config.get('activeCSSFileExtensions', []),
			excludeGlobPatterns: config.get('excludeGlobPatterns') || [],
			alsoSearchDefinitionsInStyleTag: config.get('alsoSearchDefinitionsInStyleTag', false),
			preloadCSSFiles: config.get('preloadCSSFiles', false),
			ignoreSameNameCSSFile: config.get('ignoreSameNameCSSFile', true),
			ignoreCustomElement: config.get('ignoreCustomElement', false)
		}
	}

	checkClients() {
		let searchAcrossWorkspaceFolders: boolean = this.config.get('searchAcrossWorkspaceFolders', false)

		if (searchAcrossWorkspaceFolders) {
			for (let workspaceFolder of vscode.workspace.workspaceFolders || []) {
				this.checkClientForworkspace(workspaceFolder)
			}
		}
		else {
			for (let document of vscode.workspace.textDocuments) {
				this.checkClientForOpenedDocument(document)
			}
		}
	}

	private checkClientForworkspace(workspaceFolder: vscode.WorkspaceFolder) {
		let workspaceURI = workspaceFolder.uri.toString()
		let workspaceURIs = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.toString())
		let outmostWorkspaceURI = getOutmostWorkspaceURI(workspaceURI, workspaceURIs)

		//was covered by another folder, stop it
		if (outmostWorkspaceURI && workspaceURI !== outmostWorkspaceURI && this.clients.has(workspaceURI)) {
			this.stopClient(workspaceFolder)
		}
		
		if (outmostWorkspaceURI && !this.clients.has(outmostWorkspaceURI)) {
			let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(outmostWorkspaceURI))
			if (workspaceFolder) {
				this.startClientFor(workspaceFolder)
			}
		}
	}

	checkClientForOpenedDocument(document: vscode.TextDocument) {
		if (document.uri.scheme !== 'file') {
			return
		}

		let activeHTMLFileExtensions: string[] = this.config.get('activeHTMLFileExtensions', [])
		let activeCSSFileExtensions: string[] = this.config.get('activeCSSFileExtensions', [])
		let extension = getExtension(document.uri.fsPath)
		
		if (!activeHTMLFileExtensions.includes(extension) && !activeCSSFileExtensions.includes(extension)) {
			return
		}

		//not in any workspace
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
		if (!workspaceFolder) {
			return
		}

		this.checkClientForworkspace(workspaceFolder)
	}

	private async startClientFor(workspaceFolder: vscode.WorkspaceFolder) {
		let workspaceFolderPath = workspaceFolder.uri.fsPath
		let activeHTMLFileExtensions: string[] = this.config.get('activeHTMLFileExtensions', [])
		let activeCSSFileExtensions: string[] = this.config.get('activeCSSFileExtensions', [])
		let searchAcrossWorkspaceFolders: boolean = this.config.get('searchAcrossWorkspaceFolders', false)

		let serverModule = this.context.asAbsolutePath(
			path.join('server', 'out', 'server.js')
		)
		
		//one port for only one server to debug should be ok
		let debugOptions = {execArgv: ["--nolazy", '--inspect=6009']}
		let serverOptions: ServerOptions = {
			run: {module: serverModule, transport: TransportKind.ipc},
			debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions}
		}

		//to notify open / close / content changed for html & css files in specified range 
		//and provide language service for them
		let htmlCSSPattern = generateGlobPatternFromExtensions([...activeHTMLFileExtensions, ...activeCSSFileExtensions])
		let configuration = this.getConfigObject()

		let clientOptions: LanguageClientOptions = {
			documentSelector: [{
				scheme: 'file',
				//language: 'plaintext', //plaintext is not work, just ignore it if match all plaintext files
				pattern: searchAcrossWorkspaceFolders ? htmlCSSPattern : `${workspaceFolderPath}/${htmlCSSPattern}`
			}],

			//connection.console will use this channel as output
			outputChannel: this.channel,
			
			//to initialize server params rootUri & rootPath, which has been deprected. so it looks not helpful
			//workspaceFolder,

			synchronize: {
				//same as client.register(DidChangeConfigurationNotification.type), config section changes will be captured by `onDidChangeConfiguration` in server
				//configurationSection: 'CSSNavigation',
				
				//to notify the server workspace file or folder changes, no matter changes come from vscode or outside, and trigger `onDidChangeWatchedFiles`
				fileEvents: vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolderPath, `**`))
			},

			initializationOptions: <InitializationOptions>{
				workspaceFolderPath,
				configuration
			}
		}

		let client = new LanguageClient('css-navigation', 'CSS Navigation', serverOptions, clientOptions)
		client.start()
		this.clients.set(workspaceFolder.uri.toString(), client)

		this.showChannelMessage(getTimeMarker() + `Client for workspace folder "${workspaceFolder.name}" started`)

		this.watchGitIgnoreFile(workspaceFolder)
	}

	private async restartClient(workspaceFolder: vscode.WorkspaceFolder) {
		await this.stopClient(workspaceFolder)
		this.checkClients()
	}

	async stopClient(workspaceFolder: vscode.WorkspaceFolder) {
		this.unwatchLastWatchedGitIgnoreFile(workspaceFolder)

		let uri = workspaceFolder.uri.toString()
		let client = this.clients.get(uri)
		if (client) {
			this.clients.delete(uri)
			await client.stop()
			this.showChannelMessage(getTimeMarker() + `Client for workspace folder "${workspaceFolder.name}" stopped`)
		}
	}

	private showChannelMessage(message: string) {
		this.channel.appendLine(message)
	}
	
	async restartAllClients() {
		await this.stopAllClients()
		this.checkClients()
	}

	async stopAllClients() {
		let promises: Promise<void>[] = []
		for (let uri of this.clients.keys()) {
			let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri))
			if (workspaceFolder) {
				this.stopClient(workspaceFolder)
			}
		}
		await Promise.all(promises)
		this.clients.clear()
	}
	
	// Only watch `.gitignore` in root directory.
	private watchGitIgnoreFile(workspaceFolder: vscode.WorkspaceFolder) {
		this.unwatchLastWatchedGitIgnoreFile(workspaceFolder)

		let watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder.uri.fsPath, `.gitignore`))
		let onGitIgnoreChange = () => {
			this.restartClient(workspaceFolder)
		}

		watcher.onDidCreate(onGitIgnoreChange)
		watcher.onDidDelete(onGitIgnoreChange)
		watcher.onDidChange(onGitIgnoreChange)

		this.gitIgnoreWatchers.set(workspaceFolder.uri.fsPath, watcher)
	}

	private unwatchLastWatchedGitIgnoreFile(workspaceFolder: vscode.WorkspaceFolder) {
		let watcher = this.gitIgnoreWatchers.get(workspaceFolder.uri.fsPath)
		if (watcher) {
			watcher.dispose()
		}
	}
}
