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
	DocumentColorParams,
	ColorInformation,
	Diagnostic
} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLServiceMap, CSSServiceMap} from './languages'
import {generateGlobPatternByExtensions, generateGlobPatternByPatterns, getPathExtension} from './utils'
import {Ignore, Logger} from './core'
import {findDefinitions} from './definition'
import {getCompletionItems} from './completion'
import {findReferences} from './reference'
import {findHover} from './hover'
import '../../client/out/types'
import {getCSSVariableColors} from './css-variable-color'
import {getDiagnostics} from './diagnostic'


let connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
let server: CSSNavigationServer



//////// Debug Help
// 1. How to inspect textmate tokens: Ctrl + Shift + P, then choose `Inspect Editor Tokens and Scopes`
// 2. How to inspect completion details: Ctrl + /



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
			colorProvider: configuration.enableCSSVariableColorPreview,
		}
	}
})

// Listening events.
connection.onInitialized(async () => {
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

	if (configuration.enableCSSVariableColorPreview) {
		connection.onDocumentColor(Logger.logQuerierExecutedTime(server.getDocumentCSSVariableColors.bind(server), 'hover'))

		// Just ensure no error happens.
		connection.onColorPresentation(() => null)
	}

	if (configuration.enableClassNameDiagnostic) {
		server.diagnoseAllClassNames()
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

		this.htmlServiceMap = new HTMLServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeHTMLFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			startPath: options.workspaceFolderPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// Track at most 1000 html like files.
			mostFileCount: 1000,

			// Release resources if has not been used for 30 mins.
			releaseTimeoutMs: 30 * 60 * 1000,
		}, configuration)

		this.cssServiceMap = new CSSServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobPattern: generateGlobPatternByPatterns(configuration.alwaysIncludeGlobPatterns) || undefined,
			startPath: options.workspaceFolderPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// Track at most 1000 css files.
			mostFileCount: 1000,
		}, configuration)

		let serviceMaps = [this.htmlServiceMap, this.cssServiceMap]


		// All these events can't register for twice, or the first one will not work.

		documents.onDidChangeContent(async (event: TextDocumentChangeEvent<TextDocument>) => {
			let document = event.document
			let uri = document.uri
			let documentExtension = getPathExtension(uri)
			let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
			let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

			if (isHTMLFile) {
				this.htmlServiceMap.onDocumentOpenOrContentChanged(event.document)
			}
			else if (isCSSFile) {
				this.cssServiceMap.onDocumentOpenOrContentChanged(event.document)
			}

			// Update diagnostic results.
			if (configuration.enableClassNameDiagnostic) {
				let beFresh = isHTMLFile ? this.htmlServiceMap.trackingMap.isFresh(uri)
					: isCSSFile ? this.cssServiceMap.trackingMap.isFresh(uri)
					: false

				// Not re-diagnose after opened, only after change.
				if (!beFresh) {
					if (isHTMLFile) {
						await server.diagnoseClassNames(event.document)
					}
					else if (isCSSFile) {
						await server.diagnoseAllClassNames()
					}
				}
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

		Logger.log(`📁 Server for workspace "${path.basename(this.options.workspaceFolderPath)}" started.`)
	}

	private updateTimestamp(time: number) {
		this.htmlServiceMap.updateTimestamp(time)
		this.cssServiceMap.updateTimestamp(time)
	}

	/** Provide finding definitions service. */
	async findDefinitions(params: TextDocumentPositionParams, time: number): Promise<Location[] | null> {
		this.updateTimestamp(time)

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
	async findSymbols(symbol: WorkspaceSymbolParams, time: number): Promise<SymbolInformation[] | null> {
		this.updateTimestamp(time)

		let query = symbol.query

		// Returns nothing if haven't inputted.
		if (!query) {
			return null
		}

		return await this.cssServiceMap.findSymbols(query)
	}

	/** Provide auto completion service for HTML or CSS document. */
	async getCompletionItems(params: TextDocumentPositionParams, time: number): Promise<CompletionItem[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		// HTML or CSS file.
		let position = params.position
		let offset = document.offsetAt(position)

		return getCompletionItems(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding reference service. */
	async findReferences(params: ReferenceParams, time: number): Promise<Location[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)

		return findReferences(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding hover service. */
	async findHover(params: HoverParams, time: number): Promise<Hover | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)
		
		return findHover(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide document css variable color service. */
	async getDocumentCSSVariableColors(params: DocumentColorParams, time: number): Promise<ColorInformation[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}
	
		return getCSSVariableColors(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Diagnose class names for all documents. */
	async diagnoseAllClassNames() {
		Logger.timeStart('diagnostic')

		let count = 0

		for (let document of documents.all()) {
			let diagnostics = await this.getClassNameDiagnostics(document)
			if (diagnostics) {
				connection.sendDiagnostics({uri: document.uri, diagnostics})
				count++
			}
		}

		Logger.timeEnd('diagnostic', `${count} files get diagnosed`)
	}

	/** Diagnose class names for a single document. */
	async diagnoseClassNames(document: TextDocument) {
		Logger.timeStart('diagnostic')

		let diagnostics = await this.getClassNameDiagnostics(document)
		if (diagnostics) {
			connection.sendDiagnostics({uri: document.uri, diagnostics})
		}

		Logger.timeEnd('diagnostic', diagnostics ? `1 file get diagnosed` : null)
	}

	/** Get all class name diagnostics of a document. */
	async getClassNameDiagnostics(document: TextDocument): Promise<Diagnostic[] | null> {
		return getDiagnostics(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}
}

