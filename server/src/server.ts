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
	ReferenceParams,
	Files
} from 'vscode-languageserver'

import {SimpleSelector} from './languages/common/simple-selector'
import {HTMLService, HTMLServiceMap} from './languages/html'
import {CSSService, CSSServiceMap} from './languages/css'
import {file, timer} from './libs'


process.on('unhandledRejection', function(reason, promise) {
    timer.log("Unhandled Rejection: " + reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
timer.pipeTo(connection)


interface InitializationOptions {
	workspaceFolderPath: string
	configuration: Configuration
}

interface Configuration {
	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alsoSearchDefinitionsInStyleTag: boolean
	preloadCSSFiles: boolean
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
	connection.onWorkspaceSymbol(timer.logListReturnedFunctionExecutedTime(server.findSymbolsMatchQueryParam.bind(server), 'workspace symbol'))
	connection.onCompletion(timer.logListReturnedFunctionExecutedTime(server.provideCompletion.bind(server), 'completion'))
	connection.onCompletionResolve(server.onCompletionResolve.bind(server))
	connection.onReferences(timer.logListReturnedFunctionExecutedTime(server.findRefenerces.bind(server), 'reference'))
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private options: InitializationOptions
	private config: Configuration
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap | null = null

	constructor(options: InitializationOptions) {
		this.options = options
		let config = this.config = options.configuration

		this.cssServiceMap = new CSSServiceMap({
			connection,
			documents,
			includeGlobPattern: file.generateGlobPatternFromExtensions(config.activeCSSFileExtensions)!,
			excludeGlobPattern: file.generateGlobPatternFromPatterns(config.excludeGlobPatterns),
			updateImmediately: config.preloadCSSFiles,
			startPath: options.workspaceFolderPath,
			ignoreSameNameCSSFile: config.ignoreSameNameCSSFile && config.activeCSSFileExtensions.length > 1 && config.activeCSSFileExtensions.includes('css')
		})

		//onDidChangeWatchedFiles can't been registered for twice, or the first one will not work, so handle it here, not on service map
		connection.onDidChangeWatchedFiles((params: any) => {
			this.cssServiceMap.onWatchedPathChanged(params)
			if (this.htmlServiceMap) {
				this.htmlServiceMap.onWatchedPathChanged(params)
			}
		})

		timer.log(`Server for workspace folder "${path.basename(this.options.workspaceFolderPath)}" prepared`)
	}

	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = positonParams.position	

		if (!document) {
			return null
		}
		
		if (!this.config.activeHTMLFileExtensions.includes(file.getExtension(document.uri))) {
			return null
		}

		let selector = HTMLService.getSimpleSelectorAt(document, position)
		if (!selector) {
			return null
		}

		if (this.config.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
			return null
		}

		let locations = await this.cssServiceMap.findDefinitionMatchSelector(selector)

		if (this.config.alsoSearchDefinitionsInStyleTag) {
			locations.unshift(...HTMLService.findDefinitionsInInnerStyle(document, selector))
		}

		return locations
	}

	async findSymbolsMatchQueryParam(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query
		if (!query) {
			return null
		}

		//should have at least one word character
		if (!/[a-z]/i.test(query)) {
			return null
		}

		return await this.cssServiceMap.findSymbolsMatchQuery(query)
	}

	async provideCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		if (!this.config.activeHTMLFileExtensions.includes(file.getExtension(document.uri))) {
			return null
		}

		let selector = HTMLService.getSimpleSelectorAt(document, position)
		if (!selector || selector.type === SimpleSelector.Type.Tag) {
			return null
		}

		let labels = await this.cssServiceMap.findCompletionMatchSelector(selector)
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
		this.ensureHTMLService()

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		let extension = file.getExtension(document.uri)
		if (this.config.activeHTMLFileExtensions.includes(extension)) {
			if (this.config.alsoSearchDefinitionsInStyleTag) {
				let filePath = Files.uriToFilePath(document.uri)
				let htmlService = this.htmlServiceMap!.get(filePath!) || HTMLService.create(document)
				return HTMLService.findReferencesInInner(document, position, htmlService)
			}
			return null
		}

		if (!this.config.activeCSSFileExtensions.includes(extension)) {
			return null
		}

		let selectors = CSSService.getSimpleSelectorAt(document, position)
		let locations: Location[] = []

		if (selectors) {
			for (let selector of selectors) {
				locations.push(...await this.htmlServiceMap!.findReferencesMatchSelector(selector))
			}
		}

		return locations
	}

	ensureHTMLService() {
		let {config, options} = this

		this.htmlServiceMap = this.htmlServiceMap || new HTMLServiceMap({
			connection,
			documents,
			includeGlobPattern: file.generateGlobPatternFromExtensions(config.activeHTMLFileExtensions)!,
			excludeGlobPattern: file.generateGlobPatternFromPatterns(config.excludeGlobPatterns),
			updateImmediately: false,
			startPath: options.workspaceFolderPath
		})
	}
}

