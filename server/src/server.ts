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
	Connection,
	CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver'

import {CSSSymbolMap} from './libs/css-service'
import {SimpleSelector, findDefinitionMatchSelectorInInnerStyle} from './libs/html-service'
import {generateGlobPatternFromPatterns, generateGlobPatternFromExtensions} from './libs/util'


process.on('unhandledRejection', function(reason, promise) {
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
			workspaceSymbolProvider: true
		}
	}
})

connection.onInitialized(() => {
	connection.onDefinition(server.findDefinitions.bind(server))
	connection.onWorkspaceSymbol(server.findSymbolsMatchQueryParam.bind(server))
	connection.onCompletion(server.provideCompletion.bind(server))
	connection.onCompletionResolve(server.onCompletionResolve.bind(server))
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

	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Definition | null> {
		let documentIdentifier = positonParams.textDocument
		let position = positonParams.position	
		let document = documents.get(documentIdentifier.uri)

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

	async provideCompletion(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> {
		let document = textDocumentPosition.textDocument
		let position = textDocumentPosition.position

		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}

	onCompletionResolve(item: CompletionItem): CompletionItem {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
}

