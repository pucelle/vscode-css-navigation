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
} from 'vscode-languageserver'

import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from './languages/common/simple-selector'
import {HTMLService, HTMLServiceMap} from './languages/html'
import {CSSService, CSSServiceMap} from './languages/css'
import {file, console, Ignore} from './helpers'
import {URI} from 'vscode-uri'
import {formatLabelsToCompletionItems, getLongestCommonSubsequenceLength, removeReferencePrefix} from './utils'



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
	console.setLogEnabled(configuration.enableLogLevelMessage)
	console.pipeTo(connection)


	// Print error messages after unhandled rejection promise.
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
		connection.onReferences(console.logListQuerierExecutedTime(server.findReferences.bind(server), 'reference'))
	}
})

documents.listen(connection)
connection.listen()



class CSSNavigationServer {

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
			includeImportedFiles: configuration.alwaysIncludeImportedFiles,
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
	async findDefinitions(positionParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positionParams.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let documentExtension = file.getPathExtension(document.uri)
		let position = positionParams.position
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
		let locations: LocationLink[] | null = null

		if (isHTMLFile) {
			locations = await this.findDefinitionsInHTMLLikeDocument(document, position)
		}
		else if (isCSSFile) {
			locations = await this.findDefinitionsInCSSLikeDocument(document, position)
		}

		// Sort by the longest common subsequence.
		if (locations) {
			locations.sort((a, b) => {
				const aPath = a.targetUri
				const bPath = b.targetUri

				return getLongestCommonSubsequenceLength(bPath, documentIdentifier.uri) - getLongestCommonSubsequenceLength(aPath, documentIdentifier.uri)
			})
		}

		return locations?.map(l => {
			return Location.create(l.targetUri, l.targetRange)
		}) || null
	}

	/** In HTML files, or files that can include HTML codes. */
	private async findDefinitionsInHTMLLikeDocument(document: TextDocument, position: Position): Promise<LocationLink[] | null> {
		let locations: LocationLink[] = []

		// After Clicking `<link rel="stylesheet" href="...">` or `<style src="...">`
		let resolvedImportPath = await HTMLService.getImportPathAt(document, position)
		if (resolvedImportPath) {
			locations.push(resolvedImportPath.toLocationLink())
		}

		// Searching for normal css selector.
		else {
			let selector = await HTMLService.getSimpleSelectorAt(document, position)
			if (!selector) {
				return null
			}

			// Is custom tag.
			if (configuration.ignoreCustomElement && selector.isCustomTag()) {
				return null
			}

			// Having `@import...` in a JSX file.
			if (selector.importURI) {
				this.cssServiceMap.trackMoreFile(URI.parse(selector.importURI).fsPath)
				await this.cssServiceMap.makeFresh()

				// Only find in one imported file.
				let cssService = await this.cssServiceMap.get(selector.importURI)
				if (cssService) {
					return cssService.findDefinitionsMatchSelector(selector)
				}
				else {
					return null
				}
			}

			// Parse `<style src=...>` and load imported files.
			let resolvedImportPaths = await HTMLService.scanStyleImportPaths(document)
			for (let filePath of resolvedImportPaths) {
				this.cssServiceMap.trackMoreFile(filePath)
			}

			// Find across all CSS files.
			locations.push(...await this.cssServiceMap.findDefinitionsMatchSelector(selector))

			// Find in inner style tags.
			if (configuration.alsoSearchDefinitionsInStyleTag) {
				locations.unshift(...HTMLService.findDefinitionsInInnerStyle(document, selector))
			}
		}

		return locations
	}

	/** In CSS files, or a sass file. */
	private async findDefinitionsInCSSLikeDocument(document: TextDocument, position: Position): Promise<LocationLink[] | null> {
		let locations: LocationLink[] = []

		// Clicking `@import '...';` in a CSS file.
		let resolvedImportPath = await CSSService.getImportPathAt(document, position)
		if (resolvedImportPath) {
			locations.push(resolvedImportPath.toLocationLink())
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

	/** Provide auto completion service for HTML or CSS document. */
	async provideCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		// HTML or CSS file.
		let documentExtension = file.getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return await this.provideHTMLDocumentCompletion(document, position)
		}
		else if (isCSSFile) {
			return await this.provideCSSDocumentCompletion(document, position)
		}

		return null
	}

	/** Provide completion for HTML document. */
	private async provideHTMLDocumentCompletion(document: TextDocument, position: Position): Promise<CompletionItem[] | null> {

		// Search for current selector.
		let selector = await HTMLService.getSimpleSelectorAt(document, position)

		// Complete for class name or id.
		if (!selector || selector.type === SimpleSelector.Type.Tag || selector.type === SimpleSelector.Type.CSSVariable) {
			return null
		}

		// Having `@import...` in a JSX file, returns results that exactly in imported document.
		if (selector.importURI) {
			this.cssServiceMap.trackMoreFile(URI.parse(selector.importURI).fsPath)
			await this.cssServiceMap.makeFresh()

			// Only find in one imported file.
			let cssService = await this.cssServiceMap.get(selector.importURI)
			if (cssService) {
				let labels = cssService.findCompletionLabelsMatchSelector(selector)

				// Note the complete label doesn't include identifier.
				let completeLength = selector.label.length

				return formatLabelsToCompletionItems(labels, selector.startIndex, completeLength, document)
			}
			else {
				return null
			}
		}

		// Get auto completion labels.
		let labels = await this.cssServiceMap.findCompletionLabelsMatchSelector(selector)

		// Find completion in inner style tags.
		if (configuration.alsoSearchDefinitionsInStyleTag) {
			labels.unshift(...HTMLService.findCompletionLabelsInInnerStyle(document, selector))
		}

		let completeLength = selector.label.length

		return formatLabelsToCompletionItems(labels, selector.startIndex, completeLength, document)
	}

	/** Provide completion for CSS document. */
	private async provideCSSDocumentCompletion(document: TextDocument, position: Position): Promise<CompletionItem[] | null> {

		// Searching for css selectors in current position.
		let selectorResults = CSSService.getSimpleSelectorResultsAt(document, position)
		if (!selectorResults) {
			return null
		}

		this.ensureHTMLServiceMap()

		let completionItems: CompletionItem[] = []
		let havingReference = selectorResults.raw.startsWith('&')
		let parentSelectorNames = selectorResults.parentSelectors?.map(s => s.raw) || null

		// Unique selector, no need eliminate parent reference.
		if (!havingReference) {
			let labels = await this.htmlServiceMap!.findCompletionLabelsMatch(selectorResults.raw)

			// Note the complete label includes identifier.
			let completeLength = selectorResults.raw.length

			let items = formatLabelsToCompletionItems(labels, selectorResults.startIndex, completeLength, document)
			completionItems.push(...items)
		}

		// Has parent, must remove prefix after completion.
		else {
			for (let selector of selectorResults.selectors) {
				let labels = await this.htmlServiceMap!.findCompletionLabelsMatch(selector.raw)

				// `.a-bc`, parent `.a`,  -> `&-b`.
				if (labels.length > 0 && havingReference && parentSelectorNames) {
					labels = labels.map(label => {
						return removeReferencePrefix(label, parentSelectorNames!)
					}).flat()
				}

				// Note the complete label includes identifier.
				let completeLength = selectorResults.raw.length

				let items = formatLabelsToCompletionItems(labels, selector.startIndex, completeLength, document)
				completionItems.push(...items)
			}
		}

		return completionItems
	}

	/** Provide finding reference service. */
	async findReferences(params: ReferenceParams): Promise<Location[] | null> {
		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)
		let position = params.position

		if (!document) {
			return null
		}

		let documentExtension = file.getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)

		// Find HTML references inside a style tag.
		if (isHTMLFile && configuration.alsoSearchDefinitionsInStyleTag) {
			let htmlService = this.htmlServiceMap ? await this.htmlServiceMap.get(document.uri) : undefined
			if (!htmlService) {
				htmlService = HTMLService.create(document)
			}

			let locations = HTMLService.findReferencesInInnerHTML(document, position, htmlService)
			if (locations) {
				return locations
			}
		}

		let selectors: SimpleSelector[] = []
		let locations: Location[] = []

		// From current HTML document.
		if (isHTMLFile) {
			let selector = await HTMLService.getSimpleSelectorAt(document, position)
			if (selector) {
				selectors.push(selector)
			}
		}

		// From current CSS document.
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
		if (isCSSFile) {
			selectors.push(...CSSService.getSimpleSelectorsAt(document, position) || [])
		}

		// From HTML documents.
		if (selectors.length > 0) {
			this.ensureHTMLServiceMap()

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
				startPath: options.workspaceFolderPath,

				// Track at most 1000 html like files.
				mostFileCount: 1000,
			})

			this.serviceMaps.push(this.htmlServiceMap)
		}
	}
}

