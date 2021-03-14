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
	Range,
} from 'vscode-languageserver'

import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from './languages/common/simple-selector'
import {HTMLService, HTMLServiceMap} from './languages/html'
import {CSSService, CSSServiceMap} from './languages/css'
import {file, console, Ignore} from './helpers'
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
	async findDefinitions(positonParams: TextDocumentPositionParams): Promise<Location[] | null> {
		let documentIdentifier = positonParams.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}
		
		let documentExtension = file.getPathExtension(document.uri)
		let position = positonParams.position
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return await this.findDefinitionsInHTMLLikeDocument(document, position)
		}
		else if (isCSSFile) {
			return await this.findDefinitionsInCSSLikeDocument(document, position)
		}

		return null
	}

	/** In HTML files, or files that can include HTML codes. */
	private async findDefinitionsInHTMLLikeDocument(document: TextDocument, position: Position): Promise<Location[] | null> {
		let locations: Location[] = []

		// Clicking `<link rel="stylesheet" href="...">` or `<style src="...">`
		let resolvedImportPath = await HTMLService.getImportPathAt(document, position)
		if (resolvedImportPath) {
			locations.push(
				Location.create(URI.file(resolvedImportPath).toString(), Range.create(0, 0, 0, 0))
			)
		}

		// Search for current css selector.
		else {
			let selector = await HTMLService.getSimpleSelectorAt(document, position)
			if (!selector) {
				return null
			}

			// Is custom tag.
			if (configuration.ignoreCustomElement && selector.type === SimpleSelector.Type.Tag && selector.value.includes('-')) {
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
	private async findDefinitionsInCSSLikeDocument(document: TextDocument, position: Position): Promise<Location[] | null> {
		let locations: Location[] = []

		// Clicking `@import '...';` in a CSS file.
		let resolvedImportPath = await CSSService.getImportPathAt(document, position)
		if (resolvedImportPath) {
			locations.push(
				Location.create(URI.file(resolvedImportPath).toString(), Range.create(0, 0, 0, 0))
			)
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

		// Not HTML files.
		let documentExtension = file.getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		if (!isHTMLFile) {
			return null
		}

		// Search for current selector.
		let selector = await HTMLService.getSimpleSelectorAt(document, position)
		if (!selector || selector.type === SimpleSelector.Type.Tag) {
			return null
		}

		// Having `@import...` in a JSX file, returns results that extactly in imported document.
		if (selector.importURI) {
			this.cssServiceMap.trackMoreFile(URI.parse(selector.importURI).fsPath)
			await this.cssServiceMap.makeFresh()
			
			// Only find in one imported file.
			let cssService = await this.cssServiceMap.get(selector.importURI)
			if (cssService) {
				let labels = cssService.findCompletionLabelsMatchSelector(selector)

				return this.formatLabelsToCompletionItems(labels)
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

		// From HTML document.
		if (isHTMLFile) {
			let selector = await HTMLService.getSimpleSelectorAt(document, position)
			if (selector) {
				selectors.push(selector)
			}
		}

		// From CSS document.
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
		if (isCSSFile) {
			selectors.push(...CSSService.getSimpleSelectorsAt(document, position) || [])
		}

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
				startPath: options.workspaceFolderPath
			})

			this.serviceMaps.push(this.htmlServiceMap)
		}
	}
}

