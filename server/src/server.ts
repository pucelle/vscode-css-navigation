import * as path from 'path'

import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	Location,
	WorkspaceSymbolParams,
	SymbolInformation,
	Connection,
	CompletionItem,
	CompletionItemKind,
	ReferenceParams
} from 'vscode-languageserver'

import {CSSSymbolMap} from './libs/css/css-service'
import {SimpleSelector, findDefinitionMatchSelectorInInnerStyle} from './libs/html/html-service'
import {generateGlobPatternFromPatterns, generateGlobPatternFromExtensions, pipeTimedConsoleToConnection, timer} from './libs/util'


process.on('unhandledRejection', function(reason, promise) {
    console.log("Unhandled Rejection: ", reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
pipeTimedConsoleToConnection(connection)


interface InitializationOptions {
	workspaceFolderPath: string
	configuration: {
		htmlLanguages: string[]
		cssFileExtensions: string[]
		excludeGlobPatterns: string[]

		preload: boolean
		ignoreSameNameCSSFile: boolean
		ignoreCustomElement: boolean
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
			completionProvider: {
				resolveProvider: true
			},
			definitionProvider: true,
			referencesProvider: true,
			workspaceSymbolProvider: true
		}
	}
})

connection.onInitialized(() => {
	connection.onDefinition(timer.countListReturnedFunctionExecutedTime(server.findCSSDefinitions.bind(server), 'definition'))
	connection.onWorkspaceSymbol(timer.countListReturnedFunctionExecutedTime(server.findSymbolsMatchQueryParam.bind(server), 'workplace symbol'))
	connection.onCompletion(timer.countListReturnedFunctionExecutedTime(server.provideCompletion.bind(server), 'completion'))
	connection.onCompletionResolve(server.onCompletionResolve.bind(server))
	connection.onReferences(timer.countListReturnedFunctionExecutedTime(server.findHTMLRefenerces.bind(server), 'reference'))
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private htmlLanguages: string[]
	private ignoreCustomElement: boolean
	private cssSymbolMap: CSSSymbolMap

	constructor(options: InitializationOptions) {
		let config = options.configuration
		this.htmlLanguages = config.htmlLanguages
		this.ignoreCustomElement = config.ignoreCustomElement

		this.cssSymbolMap = new CSSSymbolMap({
			connection,
			documents,
			includeGlobPattern: generateGlobPatternFromExtensions(config.cssFileExtensions)!,
			excludeGlobPattern: generateGlobPatternFromPatterns(config.excludeGlobPatterns),
			updateImmediately: config.preload,
			startPath: options.workspaceFolderPath,

			ignoreSameNameCSSFile: config.ignoreSameNameCSSFile && config.cssFileExtensions.length > 1 && config.cssFileExtensions.includes('css')
		})

		console.log(`Server for workspace folder "${path.basename(options.workspaceFolderPath)}" prepared`)
	}

	async findCSSDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = positonParams.position	

		if (!document) {
			return null
		}
		
		if (!this.htmlLanguages.includes(document.languageId)) {
			return null
		}

		let selector = SimpleSelector.getAtPosition(document, position)
		if (!selector) {
			return null
		}

		if (this.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
			return null
		}

		let locationsInHTML = findDefinitionMatchSelectorInInnerStyle(document, selector)
		let locations = await this.cssSymbolMap.findDefinitionMatchSelector(selector)

		return [...locationsInHTML, ...locations]
	}

	async findSymbolsMatchQueryParam(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query
		if (!query) {
			return null
		}

		return await this.cssSymbolMap.findSymbolsMatchQuery(query)
	}

	async provideCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		if (!this.htmlLanguages.includes(document.languageId)) {
			return null
		}

		let selector = SimpleSelector.getAtPosition(document, position)
		if (!selector) {
			return null
		}

		if (this.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
			return null
		}

		let labels = await this.cssSymbolMap.findCompletionMatchSelector(selector)
		return labels.map(label => {
			let item = CompletionItem.create(label)
			item.kind = CompletionItemKind.Class
			return item
		})
	}

	onCompletionResolve(item: CompletionItem): CompletionItem {
		return item
	}

	async findHTMLRefenerces(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		return []
	}
}

