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
import {generateGlobPatternFromPatterns, generateGlobPatternFromExtensions, getExtension, pipeTimedConsoleToConnection, timer} from './libs/util'


process.on('unhandledRejection', function(reason, promise) {
    console.log("Unhandled Rejection: ", reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
pipeTimedConsoleToConnection(connection)


interface InitializationOptions {
	workspaceFolderPath: string
	configuration: Configuration
}

interface Configuration {
	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alsoSearchDefinitionsInStyleTag: boolean
	preload: boolean
	ignoreSameNameCSSFile: boolean
	ignoreCustomElement: boolean
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
	connection.onDefinition(timer.logListReturnedFunctionExecutedTime(server.findDefinitions.bind(server), 'definition'))
	connection.onWorkspaceSymbol(timer.logListReturnedFunctionExecutedTime(server.findSymbolsMatchQueryParam.bind(server), 'workplace symbol'))
	connection.onCompletion(timer.logListReturnedFunctionExecutedTime(server.provideCompletion.bind(server), 'completion'))
	connection.onCompletionResolve(server.onCompletionResolve.bind(server))
	connection.onReferences(timer.logListReturnedFunctionExecutedTime(server.findRefenerces.bind(server), 'reference'))
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private options: InitializationOptions
	private config: Configuration
	private cssSymbolMap: CSSSymbolMap

	constructor(options: InitializationOptions) {
		this.options = options
		let config = this.config = options.configuration

		this.cssSymbolMap = new CSSSymbolMap({
			connection,
			documents,
			includeGlobPattern: generateGlobPatternFromExtensions(config.activeCSSFileExtensions)!,
			excludeGlobPattern: generateGlobPatternFromPatterns(config.excludeGlobPatterns),
			updateImmediately: config.preload,
			startPath: options.workspaceFolderPath,
			ignoreSameNameCSSFile: config.ignoreSameNameCSSFile && config.activeCSSFileExtensions.length > 1 && config.activeCSSFileExtensions.includes('css')
		})

		console.log(`Server for workspace folder "${path.basename(this.options.workspaceFolderPath)}" prepared`)
	}

	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = positonParams.position	

		if (!document) {
			return null
		}
		
		if (!this.config.activeHTMLFileExtensions.includes(getExtension(document.uri))) {
			return null
		}

		let selector = SimpleSelector.getAtPosition(document, position)
		if (!selector) {
			return null
		}

		if (this.config.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
			return null
		}

		let locationsInHTML = this.config.alsoSearchDefinitionsInStyleTag ? findDefinitionMatchSelectorInInnerStyle(document, selector) : []
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

		if (!this.config.activeHTMLFileExtensions.includes(getExtension(document.uri))) {
			return null
		}

		let selector = SimpleSelector.getAtPosition(document, position)
		if (!selector) {
			return null
		}

		if (this.config.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
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

	async findRefenerces(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		return []
	}
}

