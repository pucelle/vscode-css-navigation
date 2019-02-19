import * as path from 'path'
import Uri from 'vscode-uri'
import * as minimatch from 'minimatch'

import {
	createConnection,
	TextDocuments,
	TextDocument,
	ProposedFeatures,
	InitializeParams,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	Definition,
	WorkspaceSymbolParams,
	SymbolInformation,
	TextDocumentChangeEvent,
	Connection,
	DidChangeWatchedFilesParams,
	FileChangeType,
	Files
} from 'vscode-languageserver'

import {
	StylesheetMap
} from './css-service'

import {
	getHTMLSelectorAtPosition,
	SimpleSelector,
	SelectorType
} from './html-service'

import {
	getStat
} from './util'

process.on('unhandledRejection', function(reason, promise){
    console.log("Unhandled Rejection: ", reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
global.console = <any>connection.console


interface InitializationOptions {
	htmlLanguages: string[]
	workspaceFolderPath: string
	configuration: {
		cssFileExtensions: string[]
		excludeGlobPatterns: string[]
		definitionsOrderBy: string
	}
}

connection.onInitialize((params: InitializeParams) => {
	let options: InitializationOptions = params.initializationOptions
	server = new CSSNaigationServer(options)

	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full
			},
			definitionProvider: true,
			workspaceSymbolProvider: true
		}
	}
})

connection.onInitialized(() => {
	connection.onDidChangeWatchedFiles(server.onWatchedFilesChanged.bind(server))
	connection.onDefinition(server.findDefinitions.bind(server))
	connection.onWorkspaceSymbol(server.findSymbolsMatchQueryParam.bind(server))

	documents.onDidChangeContent(server.onFileOpenOrContentChanged.bind(server))
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private htmlLanguages: string[]

	private workspaceFolderPath: string
	
	private cssFileExtensions: string[]

	private excludeGlobPatterns: string[]

	private definitionsOrderBy: string

	private stylesheetMap: StylesheetMap

	constructor(options: InitializationOptions) {
		this.htmlLanguages = options.htmlLanguages || []
		this.workspaceFolderPath = options.workspaceFolderPath
		this.cssFileExtensions = options.configuration.cssFileExtensions
		this.excludeGlobPatterns = options.configuration.excludeGlobPatterns
		this.definitionsOrderBy = options.configuration.definitionsOrderBy
		this.stylesheetMap = new StylesheetMap(this.cssFileExtensions, this.excludeGlobPatterns)

		console.log(`Server for workspace "${path.basename(options.workspaceFolderPath)}" prepared`)
		this.stylesheetMap.loadFromFolder(this.workspaceFolderPath)
	}

	async onWatchedFilesChanged(params: DidChangeWatchedFilesParams) {
		let excludeGlobPattern = this.excludeGlobPatterns.length > 0 ? `!{${this.excludeGlobPatterns.join(',')}}` : ''
		let excludeMinimatch = excludeGlobPattern ? new minimatch.Minimatch(excludeGlobPattern) : null

		for (let change of params.changes) {
			let uri = change.uri
			let fileOrFolderPath = Uri.parse(uri).fsPath

			if (excludeMinimatch && excludeMinimatch.match(fileOrFolderPath)) {
				continue
			}

			if (change.type === FileChangeType.Created) {
				this.stylesheetMap.loadFromPath(fileOrFolderPath)
			}
			else if (change.type === FileChangeType.Changed) {
				let stat = await getStat(fileOrFolderPath)
				if (stat.isFile()) {
					let extname = path.extname(fileOrFolderPath).slice(1).toLowerCase()
					if (this.cssFileExtensions.includes(extname)) {
						this.stylesheetMap.addOrSetStale(fileOrFolderPath)
					}
				}
			}
			else if (change.type === FileChangeType.Deleted) {
				this.stylesheetMap.deleteFromPath(fileOrFolderPath)
			}
		}
	}

	//no need to handle file open because we have preloaded all the files, but here it cant be distinguished
	onFileOpenOrContentChanged(event: TextDocumentChangeEvent) {
		let document: TextDocument = event.document
		let {languageId} = document

		if (this.cssFileExtensions.includes(languageId)) {
			let filePath = Files.uriToFilePath(document.uri)
			if (filePath) {
				this.stylesheetMap.addOrSetStale(filePath, document)
			}
		}
	}

	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Definition | null> {
		let documentIdentifier = positonParams.textDocument
		let position = positonParams.position	
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}
		
		if (!this.htmlLanguages.includes(document.languageId)){
			return null
		}

		let selector = getHTMLSelectorAtPosition(document, position)
		if (!selector) {
			return null
		}

		return await this.stylesheetMap.findDefinitionMatchSelector(selector)
	}

	async findSymbolsMatchQueryParam(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query
		let selectors: SimpleSelector[]
		
		if (/^[\w-]+$/.test(query)) {
			selectors = [
				{
					type: SelectorType.CLASS,
					value: query,
					raw: '.' + query
				},
				{
					type: SelectorType.ID,
					value: query,
					raw: '#' + query
				},
			]
		}
		else if (/^\.[\w-]+$/.test(query)) {
			selectors = [
				{
					type: SelectorType.CLASS,
					value: query,
					raw: query
				}
			]
		}
		else if (/^#[\w-]+$/.test(query)) {
			selectors = [
				{
					type: SelectorType.ID,
					value: query,
					raw: query
				}
			]
		}
		else {
			return null
		}

		let infos: SymbolInformation[] = []
		for (let selector of selectors) {
			infos.push(...await this.stylesheetMap.findSymbolsMatchSelector(selector))
		}

		return infos
	}
}

