import * as path from 'path'
import * as vscode from 'vscode'
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from 'vscode-languageclient'
import {getOutmostWorkspaceURI} from './util'


process.on('unhandledRejection', function(reason, promise) {
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
			//since one 
			for (let folder of event.removed) {
				extension.onWorkspaceRemoved(folder)
			}

			extension.checkClients()
		})
	)

	return extension
}

export function deactivate(): Promise<void> {
	return extension.stopAllClients()
}


export class CSSNavigationExtension {
	
	channel = vscode.window.createOutputChannel('CSS Navigation')
	private context: vscode.ExtensionContext
	private config!: vscode.WorkspaceConfiguration
	private clients: Map<string, LanguageClient> = new Map()	//one client for each workspace folder

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadConfig()
		this.checkClients()
	}

	loadConfig() {
		this.config = vscode.workspace.getConfiguration('CSSNavigation')
	}

	checkClients() {
		let searchAcrossWorkspaceFolders: boolean = this.config.get('searchAcrossWorkspaceFolders') || false

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
			this.clients.get(workspaceURI)!.stop()
		}
		
		if (outmostWorkspaceURI && !this.clients.has(outmostWorkspaceURI)) {
			let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(outmostWorkspaceURI))
			if (workspaceFolder) {
				this.createClientForWorkspaceFolder(workspaceFolder)
			}
		}
	}

	checkClientForOpenedDocument(document: vscode.TextDocument) {
		if (document.uri.scheme !== 'file') {
			return
		}

		let htmlLanguages: string[] = this.config.get('htmlLanguages') || []
		let cssFileExtensions: string[] = this.config.get('cssFileExtensions') || []
		
		//not a html or html like file
		if (![...htmlLanguages, ...cssFileExtensions].includes(document.languageId)) {
			return
		}

		//not in any workspace
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
		if (!workspaceFolder) {
			return
		}

		this.checkClientForworkspace(workspaceFolder)
	}

	private createClientForWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder) {
		let workspaceFolderPath = workspaceFolder.uri.fsPath
		let htmlLanguages: string[] = this.config.get('htmlLanguages') || []
		let cssFileExtensions: string[] = this.config.get('cssFileExtensions') || []
		let searchAcrossWorkspaceFolders: boolean = this.config.get('searchAcrossWorkspaceFolders') || false

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
		let documentSelector = [...cssFileExtensions, ...htmlLanguages]
			.map(language => ({
				scheme: 'file',
				language,
				pattern: searchAcrossWorkspaceFolders ? undefined : `${workspaceFolderPath}/**`
			}))
		
		let clientOptions: LanguageClientOptions = {
			documentSelector,

			//connection.console will use this channel as output
			outputChannel: this.channel,
			
			//to initialize server params rootUri & rootPath, which has been deprected. so it looks not helpful
			//workspaceFolder,

			synchronize: {
				//same as client.register(DidChangeConfigurationNotification.type), config section changes will be captured by onDidChangeConfiguration in server
				//configurationSection: 'CSSNavigation',
				
				//to notify the server workspace file or folder changes, no matter changes come from vscode or outside, and trigger onDidChangeWatchedFiles
				fileEvents: vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolderPath, `**`))
			},

			initializationOptions: {
				workspaceFolderPath,
				configuration: {
					htmlLanguages,
					cssFileExtensions,
					excludeGlobPatterns: this.config.get('excludeGlobPatterns') || [],
					preload: this.config.get('preload') || false,
					ignoreSameNameCSSFile: this.config.get('ignoreSameNameCSSFile') || true,
					ignoreCustomElement: this.config.get('ignoreCustomElement') || false
				}
			}
		}

		let client = new LanguageClient('css-navigation', 'CSS Navigation', serverOptions, clientOptions)
		client.start()
		this.clients.set(workspaceFolder.uri.toString(), client)

		this.showChannelMessage(`Client for workspace folder "${workspaceFolder.name}" prepared`)
	}

	private showChannelMessage(message: string) {
		this.channel.appendLine(message)
	}
	
	onWorkspaceRemoved(folder: vscode.WorkspaceFolder) {
		let uri = folder.uri.toString()
		let client = this.clients.get(uri)
		if (client) {
			this.clients.delete(uri)
			client.stop()
		}
	}

	async restartAllClients() {
		await this.stopAllClients()
		this.checkClients()
	}

	async stopAllClients() {
		let promises: Thenable<void>[] = []
		for (let client of this.clients.values()) {
			promises.push(client.stop())
		}
		await Promise.all(promises)

		this.clients.clear()
		this.showChannelMessage(`All clients stopped`)
	}
}
