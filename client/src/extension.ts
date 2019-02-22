import * as path from 'path'
import * as vscode from 'vscode'

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient'

import {getOutmostWorkspaceFolderPath} from './util'


process.on('unhandledRejection', function(reason, promise) {
    console.log("Unhandled Rejection: ", reason)
})


let extension: CSSNavigationExtension

export function activate(context: vscode.ExtensionContext): CSSNavigationExtension {
	extension = new CSSNavigationExtension(context)

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('CSSNavigation')) {
				extension.onConfigurationChanged()
			}
		}),

		vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
			extension.onOpenDocument(document)
		}),

		vscode.workspace.onDidChangeWorkspaceFolders(event => {
			for (let folder of event.removed) {
				extension.onWorkspaceURIRemoved(folder.uri.toString())
			}
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
		this.checkCurrentOpenedDocuments()
	}

	loadConfig() {
		this.config = vscode.workspace.getConfiguration('CSSNavigation')
	}

	async onOpenDocument(document: vscode.TextDocument) {
		if (document.uri.scheme !== 'file') {
			return
		}

		//not in any workspace
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
		if (!workspaceFolder) {
			return
		}

		let htmlLanguages: string[] = this.config.get('htmlLanguages') || []
		let cssFileExtensions: string[] = this.config.get('cssFileExtensions') || []
		
		//not a html or html like file
		if (![...htmlLanguages, ...cssFileExtensions].includes(document.languageId)) {
			return
		}

		let workspaceFolderPath = workspaceFolder.uri.toString()
		let workspaceFolderPaths = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.toString())
		let outmostWorkspaceFolderPath = getOutmostWorkspaceFolderPath(workspaceFolderPath, workspaceFolderPaths)
		
		if (outmostWorkspaceFolderPath && !this.clients.has(outmostWorkspaceFolderPath)) {
			let workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(outmostWorkspaceFolderPath))
			if (workspaceFolder) {
				await this.createClientForWorkspace(workspaceFolder)
			}
		}
	}

	private async createClientForWorkspace(workspaceFolder: vscode.WorkspaceFolder) {
		let workspaceFolderPath = workspaceFolder.uri.fsPath
		let htmlLanguages: string[] = this.config.get('htmlLanguages') || []
		let cssFileExtensions: string[] = this.config.get('cssFileExtensions') || []
		let updateImmediately: boolean = this.config.get('updateImmediately') || false

		let serverModule = this.context.asAbsolutePath(
			path.join('server', 'out', 'server.js')
		)
		
		//one port for only one server to debug should be ok
		let debugOptions = {execArgv: ["--nolazy", '--inspect=6009']}
		let serverOptions: ServerOptions = {
			run: {module: serverModule, transport: TransportKind.ipc},
			debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions}
		}

		//to notify server html & css files their open / close / content changed
		let documentSelector = [...cssFileExtensions, ...htmlLanguages]
			.map(language => ({
				scheme: 'file',
				language,
				pattern: `${workspaceFolderPath}/**`
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
					updateImmediately
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

	//to eusure they have related clients
	async checkCurrentOpenedDocuments() {
		for (let document of vscode.workspace.textDocuments) {
			await this.onOpenDocument(document)
		}
	}
	
	onWorkspaceURIRemoved(uri: string) {
		let client = this.clients.get(uri)
		if (client) {
			this.clients.delete(uri)
			client.stop()
		}
	}

	async onConfigurationChanged() {
		this.loadConfig()
		await this.restartAllClients()
	}

	private async restartAllClients() {
		await this.stopAllClients()
		await this.checkCurrentOpenedDocuments()
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
