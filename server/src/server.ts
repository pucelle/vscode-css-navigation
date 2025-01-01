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
	ReferenceParams,
	TextDocumentChangeEvent,
	HoverParams,
	Hover,
} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLServiceMap, CSSServiceMap} from './languages'
import {generateGlobPatternByExtensions, generateGlobPatternByPatterns, getPathExtension, Ignore, Logger} from './helpers'
import {findDefinitions} from './definition'
import {getCompletionItems} from './completion'


let connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
let server: CSSNavigationServer


// Do initializing.
connection.onInitialize((params: InitializeParams) => {
	let options: InitializationOptions = params.initializationOptions
	configuration = options.configuration
	server = new CSSNavigationServer(options)


	// Initialize console channel and log level.
	Logger.setLogEnabled(configuration.enableLogLevelMessage)
	Logger.pipeTo(connection)


	// Print error messages after unhandled rejection promise.
	process.on('unhandledRejection', function(reason) {
		Logger.warn("Unhandled Rejection: " + reason)
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
			workspaceSymbolProvider: configuration.enableWorkspaceSymbols,
			hoverProvider: configuration.enableHover,
		}
	}
})

// Listening events.
connection.onInitialized(() => {
	if (configuration.enableGoToDefinition) {
		connection.onDefinition(Logger.logQuerierExecutedTime(server.findDefinitions.bind(server), 'definition'))
	}

	if (configuration.enableWorkspaceSymbols) {
		connection.onWorkspaceSymbol(Logger.logQuerierExecutedTime(server.findSymbols.bind(server), 'workspace symbol'))
	}

	if (configuration.enableIdAndClassNameCompletion) {
		connection.onCompletion(Logger.logQuerierExecutedTime(server.getCompletionItems.bind(server), 'completion'))
	}

	if (configuration.enableFindAllReferences) {
		connection.onReferences(Logger.logQuerierExecutedTime(server.findReferences.bind(server), 'reference'))
	}

	if (configuration.enableHover) {
		connection.onHover(Logger.logQuerierExecutedTime(server.findHover.bind(server), 'hover'))
	}
})

documents.listen(connection)
connection.listen()



class CSSNavigationServer {

	private options: InitializationOptions
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap

	constructor(options: InitializationOptions) {
		this.options = options

		this.htmlServiceMap = new HTMLServiceMap(documents, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeHTMLFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			startPath: options.workspaceFolderPath,

			// Track at most 500 html like files.
			mostFileCount: 500,

			// HTML service is low frequency, so release content if has not been used for 5mins.
			releaseTimeoutMs: 300000,
		})

		this.cssServiceMap = new CSSServiceMap(documents, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobPattern: generateGlobPatternByPatterns(configuration.alwaysIncludeGlobPatterns) || undefined,
			startPath: options.workspaceFolderPath,
			ignoreSameNameCSSFile: configuration.ignoreSameNameCSSFile && configuration.activeCSSFileExtensions.length > 1 && configuration.activeCSSFileExtensions.includes('css'),
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],
		})

		let serviceMaps = [this.htmlServiceMap, this.cssServiceMap]


		// All those events can't been registered for twice, or the first one will not work.
		documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of serviceMaps) {
				map.onDocumentOpenOrContentChanged(event.document)
			}
		})

		documents.onDidSave((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of serviceMaps) {
				map.onDocumentSaved(event.document)
			}
		})

		documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
			for (let map of serviceMaps) {
				map.onDocumentClosed(event.document)
			}
		})

		connection.onDidChangeWatchedFiles((params: any) => {
			for (let map of serviceMaps) {
				map.onWatchedFileOrFolderChanged(params)
			}
		})

		Logger.log(`CSS Navigation Service for workspace "${path.basename(this.options.workspaceFolderPath)}" started.`)
	}

	/** Provide finding definitions service. */
	async findDefinitions(params: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)

		return findDefinitions(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding symbol service. */
	async findSymbols(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query

		// Returns nothing if haven't inputted.
		if (!query) {
			return null
		}

		return await this.cssServiceMap.findSymbols(query)
	}

	/** Provide auto completion service for HTML or CSS document. */
	async getCompletionItems(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		// HTML or CSS file.
		let position = params.position
		let offset = document?.offsetAt(position)

		return getCompletionItems(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding reference service. */
	async findReferences(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)
		let documentExtension = getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return this.findReferencesInHTML(document, offset)
		}
		else if (isCSSFile) {
			return this.findReferencesInCSS(document, offset)
		}

		return null
	}

	/** Provide finding reference service for HTML document. */
	async findReferencesInHTML(document: TextDocument, offset: number): Promise<Location[] | null> {
		let currentHTMLService = await this.htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart || !fromPart.isDefinitionType()) {
			return null
		}

		let locations: Location[] = []


		// Find HTML or CSS Variable references within current document.
		if (fromPart.isCSSType()) {
			locations.push(...currentHTMLService.findReferences(fromPart))
		}


		return locations
	}

	/** Provide finding selector reference service for CSS document. */
	async findReferencesInCSS(document: TextDocument, offset: number): Promise<Location[] | null> {
		let currentHTMLService = await this.htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart || !fromPart.isDefinitionType()) {
			return null
		}

		let locations: Location[] = []


		// Find HTML references across all html documents.
		if (fromPart.isSelectorType()) {
			locations.push(...await this.htmlServiceMap.findReferences(fromPart))
		}

		// Find CSS Variable references across all html documents.
		else if (fromPart.isCSSVariableType()) {
			locations.push(...await this.cssServiceMap.findReferences(fromPart))
		}


		return locations
	}

	/** Provide finding hover service. */
	async findHover(params: HoverParams): Promise<Hover | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)
		let documentExtension = getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return this.findHoverInHTML(document, offset)
		}
		else if (isCSSFile) {
			return this.findHoverInCSS(document, offset)
		}

		return null
	}

	/** Find hover from a HTML document. */
	async findHoverInHTML(document: TextDocument, offset: number): Promise<Hover | null> {
		let currentHTMLService = await this.htmlServiceMap.forceGetServiceByDocument(document)
		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart || !fromPart.isReferenceType()) {
			return null
		}

		let matchPart = fromPart.toDefinitionMode()


		// Find within current document.
		let hover = currentHTMLService.findHover(matchPart, fromPart, document)
		if (hover) {
			return hover
		}


		// Find across all css documents.
		if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {
			hover = await this.cssServiceMap.findHover(matchPart, fromPart, document)
		}

		return null
	}

	/** Provide finding hover service. */
	async findHoverInCSS(document: TextDocument, offset: number): Promise<Hover | null> {
		let currentCSSService = await this.cssServiceMap.forceGetServiceByDocument(document)
		let fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart || !fromPart.isReferenceType()) {
			return null
		}

		let matchPart = fromPart.toDefinitionMode()


		// Find within current document.
		let hover = currentCSSService.findHover(matchPart, fromPart, document)
		if (hover) {
			return hover
		}


		// Find across all css documents.
		if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {
			hover = await this.cssServiceMap.findHover(matchPart, fromPart, document)
		}

		return null
	}
}

