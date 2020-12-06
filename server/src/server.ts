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
	TextDocumentChangeEvent,
} from 'vscode-languageserver'

import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from './languages/common/simple-selector'
import {HTMLService, HTMLServiceMap} from './languages/html'
import {CSSService, CSSServiceMap} from './languages/css'
import {file, console, Ignore} from './internal'
import {URI} from 'vscode-uri'



let connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
let server: CSSNaigationServer



// Do initializing.
connection.onInitialize((params: InitializeParams) => {
	let options: InitializationOptions = params.initializationOptions
	configuration = options.configuration
	server = new CSSNaigationServer(options)


	// Initialize console channel and log level.
	console.setLogEnabled(configuration.enableLogLevelMessage)
	console.pipeTo(connection)


	// Print error messages after unprojected promise.
	process.on('unhandledRejection', function(reason) {
		console.warn("Unhandled Rejection: " + reason)
	})


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

// Listening events.
connection.onInitialized(() => {
	if (configuration.enableGoToDefinition) {
		connection.onDefinition(console.logListQuerierExecutedTime(server.findDefinitions.bind(server), 'definition'))
	}

	if (configuration.enableWorkspaceSymbols) {
		connection.onWorkspaceSymbol(console.logListQuerierExecutedTime(server.findSymbolsMatchQueryParam.bind(server), 'workspace symbol'))
	}
	
	if (configuration.enableIdAndClassNameCompletion) {
		connection.onCompletion(console.logListQuerierExecutedTime(server.provideCompletion.bind(server), 'completion'))
	}

	if (configuration.enableFindAllReferences) {
		connection.onReferences(console.logListQuerierExecutedTime(server.findRefenerces.bind(server), 'reference'))
	}
})

documents.listen(connection)
connection.listen()



class CSSNaigationServer {

	private options: InitializationOptions
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap | null = null
	private serviceMaps: (CSSServiceMap | HTMLServiceMap)[] = []

	constructor(options: InitializationOptions) {
		this.options = options

		this.cssServiceMap = new CSSServiceMap(documents, {
			includeFileGlobPattern: file.generateGlobPatternFromExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.alwaysIncludeGlobPatterns) || undefined,
			startPath: options.workspaceFolderPath,
			ignoreSameNameCSSFile: configuration.ignoreSameNameCSSFile && configuration.activeCSSFileExtensions.length > 1 && configuration.activeCSSFileExtensions.includes('css'),
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],
		})

		this.serviceMaps = [this.cssServiceMap]


		// All those events can't been registered for twice, or the first one will not work.
		documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of this.serviceMaps) {
				map.onDocumentOpenOrContentChanged(event.document)
			}
		})

		documents.onDidSave((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of this.serviceMaps) {
				map.onDocumentSaved(event.document)
			}
		})

		documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of this.serviceMaps) {
				map.onDocumentClosed(event.document)
			}
		})

		connection.onDidChangeWatchedFiles((params: any) => {
			for (let map of this.serviceMaps) {
				map.onWatchedFileOrFolderChanged(params)
			}
		})
		

		console.log(`Server for workspace folder "${path.basename(this.options.workspaceFolderPath)}" started`)
	}

	/** Provide finding definition service. */
	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = positonParams.position	

		if (!document) {
			return null
		}
		
		// Not belongs to HTML files.
		if (!configuration.activeHTMLFileExtensions.includes(file.getPathExtension(document.uri))) {
			return null
		}

		// Search current css selector.
		let selector = await HTMLService.searchSimpleSelectorAt(document, position)
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

	/** Provide finding symbol service. */
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

	/** Provide auto completion service. */
	async provideCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		if (!configuration.activeHTMLFileExtensions.includes(file.getPathExtension(document.uri))) {
			return null
		}

		let selector = await HTMLService.searchSimpleSelectorAt(document, position)
		if (!selector || selector.type === SimpleSelector.Type.Tag) {
			return null
		}

		// If module css file not in current work space folder, create a temporary `CSSService` to load it.
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

	/** Provide finding reference service. */
	async findRefenerces(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		let extension = file.getPathExtension(document.uri)
		if (configuration.activeHTMLFileExtensions.includes(extension)) {
			if (configuration.alsoSearchDefinitionsInStyleTag) {
				let filePath = URI.parse(document.uri).fsPath

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

		this.ensureHTMLServiceMap()

		if (selectors) {
			for (let selector of selectors) {
				locations.push(...await this.htmlServiceMap!.findReferencesMatchSelector(selector))
			}
		}

		return locations
	}

	/** Ensure having HTML service map. */
	private ensureHTMLServiceMap() {
		let {options} = this

		if (!this.htmlServiceMap) {
			this.htmlServiceMap = new HTMLServiceMap(documents, {
				includeFileGlobPattern: file.generateGlobPatternFromExtensions(configuration.activeHTMLFileExtensions)!,
				excludeGlobPattern: file.generateGlobPatternFromPatterns(configuration.excludeGlobPatterns) || undefined,
				startPath: options.workspaceFolderPath
			})

			this.serviceMaps.push(this.htmlServiceMap)
		}
	}
}

