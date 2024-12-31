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
	LocationLink,
	HoverParams,
	Hover,
} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLServiceMap, CSSServiceMap, PartType, PathResolver} from './languages'
import {generateGlobPatternByExtensions, generateGlobPatternByPatterns, getPathExtension, Ignore, Logger} from './helpers'
import {getLongestCommonSubsequenceLength} from './utils'


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
	private serviceMaps: (CSSServiceMap | HTMLServiceMap)[] = []

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
		let documentExtension = getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
		let locations: LocationLink[] | null = null

		if (isHTMLFile) {
			locations = await this.findDefinitionsInHTML(document, offset)
		}
		else if (isCSSFile) {
			locations = await this.findDefinitionsInCSS(document, offset)
		}

		if (!locations) {
			return null
		}

		// Sort by the longest common subsequence.
		let items = locations.map(l => {
			return {
				location: l,
				subsequence: getLongestCommonSubsequenceLength(l.targetUri, documentIdentifier.uri),
			}
		})

		items.sort((a, b) => {
			return a.subsequence - b.subsequence
		})

		return items.map(item => {
			return Location.create(item.location.targetUri, item.location.targetRange)
		})
	}

	/** In HTML files, or files that can include HTML codes. */
	private async findDefinitionsInHTML(document: TextDocument, offset: number): Promise<LocationLink[] | null> {
		let currentHTMLService = await this.htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart || !fromPart.isReferenceType()) {
			return null
		}

		let matchPart = fromPart.toDefinitionMode()
		let locations: LocationLink[] = []


		// Is custom tag, and not available because wanting other plugin to provide it.
		if (configuration.ignoreCustomElement
			&& fromPart.type === PartType.Tag
			&& fromPart.text.includes('-')
		) {
			return null
		}


		// When mouse locates at `<link rel="stylesheet" href="|...|">` or `<style src="|...|">`, goto file start.
		if (fromPart.type === PartType.CSSImportPath) {
			let link = await PathResolver.resolveImportLocationLink(fromPart, document)
			if (!link) {
				return null
			}

			return [link]
		}


		// Find definitions for embedded CSS codes within current document.
		if (fromPart.isCSSType()) {
			return currentHTMLService.findDefinitions(matchPart, fromPart, document)
		}


		// Try to find definition from split view.
		// let visibleEditors = vscode.window.visibleTextEditors

		// let cssVisibleEditors = visibleEditors.filter(e => e.document.uri.toString() !== document.uri
		// 	&& configuration.activeCSSFileExtensions.includes(getPathExtension(e.document.uri.toString()))
		// )

		// for (let cssEditor of cssVisibleEditors) {
		// 	let cssURI = cssEditor.document.uri.toString()
		// 	let cssService = await this.cssServiceMap.forceGetServiceByURI(cssURI)
		// 	if (!cssService) {
		// 		continue
		// 	}

		// 	locations.push(...cssService.findDefinitions(matchPart, fromPart, document))
		// }

		// if (locations.length > 0) {
		// 	return locations
		// }


		// Having CSS files imported, firstly search within these files, if has, not searching more.
		let cssPaths = await currentHTMLService.getImportedCSSPaths()

		// Find embedded style definitions.
		locations.push(...currentHTMLService.findDefinitions(matchPart, fromPart, document))

		for (let cssPath of cssPaths) {
			let cssService = await this.cssServiceMap.forceGetServiceByFilePath(cssPath)
			if (!cssService) {
				continue
			}

			locations.push(...cssService.findDefinitions(matchPart, fromPart, document))
		}

		if (locations.length > 0) {
			return locations
		}


		// Find across all CSS files.
		locations.push(...await this.cssServiceMap.findDefinitions(matchPart, fromPart, document))


		return locations
	}

	/** In CSS files, or a sass file. */
	private async findDefinitionsInCSS(document: TextDocument, offset: number): Promise<LocationLink[] | null> {
		let currentCSSService = await this.cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart || !fromPart.isReferenceType()) {
			return null
		}


		let matchPart = fromPart.toDefinitionMode()
		let locations: LocationLink[] = []

		// When mouse locates at `<link rel="stylesheet" href="|...|">` or `<style src="|...|">`, goto file start.
		if (matchPart.type === PartType.CSSVariableDeclaration) {
			locations.push(...await this.cssServiceMap.findDefinitions(matchPart, fromPart, document))
		}

		return locations
	}

	/** Provide finding symbol service. */
	async findSymbols(symbol: WorkspaceSymbolParams): Promise<SymbolInformation[] | null> {
		let query = symbol.query
		if (!query) {
			return null
		}

		// Should have at least one word letter.
		if (!/[a-z]/i.test(query)) {
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
		let documentExtension = getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return await this.getCompletionItemsInHTML(document, offset)
		}
		else if (isCSSFile) {
			return await this.getCompletionItemsInCSS(document, offset)
		}

		return null
	}

	/** Provide completion for HTML document. */
	private async getCompletionItemsInHTML(document: TextDocument, offset: number): Promise<CompletionItem[] | null> {
		let currentHTMLService = await this.htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart) {
			return null
		}


		let matchPart = fromPart.toDefinitionMode()
		let items: CompletionItem[] = []

		// Complete html element class name.
		if (fromPart.isHTMLType()) {
			items.push(...currentHTMLService.getCompletionItems(matchPart, fromPart, document))
			items.push(...await this.cssServiceMap.getCompletionItems(matchPart, fromPart, document))
		}

		// Complete class name for css selector of a css document.
		else if (fromPart.isCSSType()) {
			items.push(...await this.htmlServiceMap.getReferencedCompletionItems(fromPart, document))

			// Declare or reference a CSS Variable.
			if (fromPart.isCSSVariableType()) {
				items.push(...await this.cssServiceMap.getCompletionItems(matchPart, fromPart, document))
			}
		}

		return items
	}

	/** Provide completion for CSS document. */
	private async getCompletionItemsInCSS(document: TextDocument, offset: number): Promise<CompletionItem[] | null> {
		let currentCSSService = await this.cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		let matchPart = fromPart.toDefinitionMode()
		let items: CompletionItem[] = []


		// Find selector referenced completions across all html documents.
		if (fromPart.isSelectorType()) {
			items.push(...await this.htmlServiceMap.getReferencedCompletionItems(fromPart, document))
		}

		// Find CSS Variables across all css documents.
		else if (fromPart.isCSSVariableType()) {
			items.push(...await this.cssServiceMap.getCompletionItems(matchPart, fromPart, document))
		}


		return items
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

