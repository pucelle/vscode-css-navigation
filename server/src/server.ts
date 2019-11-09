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
import {file, timer, Ignore} from './libs'


process.on('unhandledRejection', function(reason) {
    timer.log("Unhandled Rejection: " + reason)
})


let connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
let documents: TextDocuments = new TextDocuments()
let server: CSSNaigationServer
timer.pipeTo(connection)


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
	alwaysIncludeGlobPatterns: string[],
	alsoSearchDefinitionsInStyleTag: boolean
	preloadCSSFiles: boolean
	ignoreSameNameCSSFile: boolean
	ignoreCustomElement: boolean
	ignoreFilesBy: Ignore[]
	ignoreFilesInNPMIgnore: boolean
}

connection.onInitialize((params: InitializeParams) => {
	let options: InitializationOptions = params.initializationOptions
	configuration = options.configuration
	server = new CSSNaigationServer(options)

	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full
			},
			completionProvider: configuration.enableIdAndClassNameCompletion ? {
				resolveProvider: false
			} : undefined,
			definitionProvider: configuration.enableGoToDefinition,
			referencesProvider: configuration.enableFindAllReferences,
			workspaceSymbolProvider: configuration.enableWorkspaceSymbols
		}
	}
})

connection.onInitialized(() => {
	if (configuration.enableGoToDefinition) {
		connection.onDefinition(timer.logListReturnedFunctionExecutedTime(server.findDefinitions.bind(server), 'definition'))
	}

	if (configuration.enableWorkspaceSymbols) {
		connection.onWorkspaceSymbol(timer.logListReturnedFunctionExecutedTime(server.findSymbolsMatchQueryParam.bind(server), 'workspace symbol'))
	}
	
	if (configuration.enableIdAndClassNameCompletion) {
		connection.onCompletion(timer.logListReturnedFunctionExecutedTime(server.provideCompletion.bind(server), 'completion'))
	}

	if (configuration.enableFindAllReferences) {
		connection.onReferences(timer.logListReturnedFunctionExecutedTime(server.findRefenerces.bind(server), 'reference'))
	}
})

documents.listen(connection)
connection.listen()


class CSSNaigationServer {

	private options: InitializationOptions
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap | null = null

	constructor(options: InitializationOptions) {
		this.options = options

		this.cssServiceMap = new CSSServiceMap({
			connection,
			documents,
			includeGlobPattern: file.generateGlobPatternFromExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.excludeGlobPatterns),
			alwaysIncludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.alwaysIncludeGlobPatterns),
			updateImmediately: configuration.preloadCSSFiles,
			startPath: options.workspaceFolderPath,
			ignoreSameNameCSSFile: configuration.ignoreSameNameCSSFile && configuration.activeCSSFileExtensions.length > 1 && configuration.activeCSSFileExtensions.includes('css'),
			ignoreFilesBy: configuration.ignoreFilesBy,
		})

		//onDidChangeWatchedFiles can't been registered for twice, or the first one will not work, so handle it here, not on service map
		connection.onDidChangeWatchedFiles((params: any) => {
			this.cssServiceMap.onWatchedPathChanged(params)
			if (this.htmlServiceMap) {
				this.htmlServiceMap.onWatchedPathChanged(params)
			}
		})

		timer.log(`Server for workspace folder "${path.basename(this.options.workspaceFolderPath)}" started`)
	}

	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = positonParams.position	

		if (!document) {
			return null
		}
		
		if (!configuration.activeHTMLFileExtensions.includes(file.getExtension(document.uri))) {
			return null
		}

		let selector = await HTMLService.getSimpleSelectorAt(document, position)
		if (!selector) {
			return null
		}

		if (configuration.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
			return null
		}

		// If module css file not in current work space folder, create an `CSSService`.
		if (selector.filePath) {
			let cssService: CSSService | null = await this.cssServiceMap.get(selector.filePath) || null
			if (!cssService) {
				cssService = await CSSService.createFromFilePath(selector.filePath)
			}
			
			if (cssService) {
				return cssService.findDefinitionsMatchSelector(selector)
			}
			else {
				return null
			}
		}

		let locations = await this.cssServiceMap.findDefinitionsMatchSelector(selector)

		if (configuration.alsoSearchDefinitionsInStyleTag) {
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

		if (!configuration.activeHTMLFileExtensions.includes(file.getExtension(document.uri))) {
			return null
		}

		let selector = await HTMLService.getSimpleSelectorAt(document, position)
		if (!selector || selector.type === SimpleSelector.Type.Tag) {
			return null
		}

		// If module css file not in current work space folder, create an `CSSService` to load it.
		if (selector.filePath) {
			let cssService: CSSService | null = await this.cssServiceMap.get(selector.filePath) || null
			if (!cssService) {
				cssService = await CSSService.createFromFilePath(selector.filePath)
			}
			
			if (cssService) {
				let labels = cssService.findCompletionLabelsMatchSelector(selector)
				return this.formatLabelsToCompletionItems(labels)
			}
			else {
				return null
			}
		}

		let labels = await this.cssServiceMap.findCompletionLabelsMatchSelector(selector)
		return this.formatLabelsToCompletionItems(labels)
	}

	private formatLabelsToCompletionItems(labels: string[]): CompletionItem[] {
		return labels.map(label => {
			let item = CompletionItem.create(label)
			item.kind = CompletionItemKind.Class
			return item
		})
	}

	async findRefenerces(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		let extension = file.getExtension(document.uri)
		if (configuration.activeHTMLFileExtensions.includes(extension)) {
			if (configuration.alsoSearchDefinitionsInStyleTag) {
				let filePath = Files.uriToFilePath(document.uri)

				let htmlService = this.htmlServiceMap ? this.htmlServiceMap.get(filePath!) : undefined
				if (!htmlService) {
					htmlService = HTMLService.create(document)
				}

				return HTMLService.findReferencesInInner(document, position, htmlService)
			}
			return null
		}

		if (!configuration.activeCSSFileExtensions.includes(extension)) {
			return null
		}

		let selectors = CSSService.getSimpleSelectorAt(document, position)
		let locations: Location[] = []

		this.ensureHTMLService()

		if (selectors) {
			for (let selector of selectors) {
				locations.push(...await this.htmlServiceMap!.findReferencesMatchSelector(selector))
			}
		}

		return locations
	}

	private ensureHTMLService() {
		let {options} = this

		this.htmlServiceMap = this.htmlServiceMap || new HTMLServiceMap({
			connection,
			documents,
			includeGlobPattern: file.generateGlobPatternFromExtensions(configuration.activeHTMLFileExtensions)!,
			excludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.excludeGlobPatterns),
			updateImmediately: false,
			startPath: options.workspaceFolderPath
		})
	}
}

