import * as path from 'path'

import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	Definition,
	WorkspaceSymbolParams,
	SymbolInformation,
	Connection
} from 'vscode-languageserver'

import { StylesheetMap } from './css-service'
import { SimpleSelector } from './html-service'
import { generateGlobPatternFromPatterns, generateGlobPatternFromExtensions } from './util'


process.on('unhandledRejection', function(reason, promise){
    console.log("Unhandled Rejection: ", reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
global.console = <any>connection.console


interface InitializationOptions {
	workspaceFolderPath: string
	configuration: {
		htmlLanguages: string[]
		cssFileExtensions: string[]
		excludeGlobPatterns: string[]
		updateImmediately: boolean
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
	connection.onDefinition(server.findDefinitions.bind(server))
	connection.onWorkspaceSymbol(server.findSymbolsMatchQueryParam.bind(server))
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private htmlLanguages: string[]
	private stylesheetMap: StylesheetMap

	constructor(options: InitializationOptions) {
		let config = options.configuration
		this.htmlLanguages = config.htmlLanguages

		this.stylesheetMap = new StylesheetMap(
			connection,
			documents,
			generateGlobPatternFromExtensions(config.cssFileExtensions)!,
			generateGlobPatternFromPatterns(config.excludeGlobPatterns),
			config.updateImmediately
		)

		console.log(`Server for workspace folder "${path.basename(options.workspaceFolderPath)}" prepared`)
		this.stylesheetMap.trackFolder(options.workspaceFolderPath)
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

		let selector = SimpleSelector.getAtPosition(document, position)
		if (!selector) {
			return null
		}

		let locations = await this.stylesheetMap.findDefinitionMatchSelector(selector)
		return locations
	}

	async findSymbolsMatchQueryParam(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query
		if (!query) {
			return null
		}

		return await this.stylesheetMap.findSymbolsMatchQuery(query)
	}
}

