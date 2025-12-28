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
	Diagnostic,
	CodeLens,
	CodeLensParams
} from 'vscode-languageserver'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLServiceMap, CSSServiceMap} from './languages'
import {generateGlobPatternByExtensions, generateGlobPatternByPatterns, getPathExtension} from './utils'
import {Ignore, Logger} from './core'
import {findDefinitions} from './definition'
import {getCompletionItems} from './completion'
import {findReferences} from './reference'
import {findHover} from './hover'
import {getCSSVariableColors} from './css-variable-color'
import {getDiagnostics} from './diagnostic'
import {getCodeLens} from './code-lens'
import '../../client/out/types'
import {GlobPathSharer} from './core/file-tracker/glob-path-sharer'


let connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
let server: CSSNavigationServer



//////// Debug Help
// 1. How to inspect textmate tokens: Ctrl + Shift + P, then choose `Inspect Editor Tokens and Scopes`
// 2. How to inspect completion details: Ctrl + /


// Server side request handlers.
connection.onRequest('definitions', async({uri, position}: {uri: string, position: Position}) => {
	let document = documents.get(uri)
	if (!document) {
		return {
			success: false,
			data: null,
		}
	}

	return {
		success: true,
		data: await server.getDefinitions(document, position),
	}
})

// Server side request handlers.
connection.onRequest('references', async({uri, position}: {uri: string, position: Position}) => {
	let document = documents.get(uri)
	if (!document) {
		return {
			success: false,
			data: null,
		}
	}

	return {
		success: true,
		data: await server.getReferences(document, position)
	}
})



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
			completionProvider: configuration.enableCompletions ? {
				resolveProvider: false
			} : undefined,
			definitionProvider: configuration.enableGoToDefinition,
			referencesProvider: configuration.enableFindAllReferences,
			workspaceSymbolProvider: configuration.enableWorkspaceSymbols,
			hoverProvider: configuration.enableHover,
			codeLensProvider: configuration.enableDefinitionCodeLens || configuration.enableReferenceCodeLens ? {resolveProvider: true} : undefined,
			colorProvider: configuration.enableCSSVariableColorPreview,
		}
	}
})

// Listening events.
connection.onInitialized(async () => {
	if (configuration.enableGoToDefinition) {
		connection.onDefinition(Logger.logQuerierExecutedTime(server.provideDefinitions.bind(server), 'definition'))
	}

	if (configuration.enableWorkspaceSymbols) {
		connection.onWorkspaceSymbol(Logger.logQuerierExecutedTime(server.provideSymbols.bind(server), 'workspace symbol'))
	}

	if (configuration.enableCompletions) {
		connection.onCompletion(Logger.logQuerierExecutedTime(server.provideCompletionItems.bind(server), 'completion'))
	}

	if (configuration.enableFindAllReferences) {
		connection.onReferences(Logger.logQuerierExecutedTime(server.provideReferences.bind(server), 'reference'))
	}

	if (configuration.enableHover) {
		connection.onHover(Logger.logQuerierExecutedTime(server.provideHover.bind(server), 'hover'))
	}

	if (configuration.enableDefinitionCodeLens || configuration.enableReferenceCodeLens) {
		connection.onCodeLens(Logger.logQuerierExecutedTime(server.provideCodeLens.bind(server), 'codeLens'))
	}

	if (configuration.enableCSSVariableColorPreview) {
		connection.onDocumentColor(Logger.logQuerierExecutedTime(server.provideDocumentCSSVariableColors.bind(server), 'hover'))

		// Just ensure no error happens.
		connection.onColorPresentation(() => null)
	}
})

documents.listen(connection)
connection.listen()



class CSSNavigationServer {

	private options: InitializationOptions
	private jsClassNameReferenceNameRegExp: RegExp | null
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap
	private diagnosedVersionMap: Map<string, number> = new Map()

	constructor(options: InitializationOptions) {
		this.options = options

		let names = '(?:' + configuration.jsClassNameReferenceNames.map(n => n.replace(/\*/g, '\\w*?')).join('|') + ')'

		try {
			this.jsClassNameReferenceNameRegExp = new RegExp(
				`\\b(?:let|var|const)\\s+${names}\\s*=\\s*["'\`](.*?)["'\`]|\\s*${names}\\s*:\\s*["'\`](.*?)["'\`]`,
				'gi'
			)
		}
		catch (err) {
			this.jsClassNameReferenceNameRegExp = null
		}

		let startPath = options.workspaceFolderPath
		
		let alwaysIncludeGlobPattern = configuration.alwaysIncludeGlobPatterns
			? generateGlobPatternByPatterns(configuration.alwaysIncludeGlobPatterns)
			: undefined

		// Shared glob querying.
		let alwaysIncludeGlobSharer = alwaysIncludeGlobPattern ? new GlobPathSharer(alwaysIncludeGlobPattern, startPath) : undefined

		this.htmlServiceMap = new HTMLServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeHTMLFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobSharer,
			startPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// Track at most 1000 html like files.
			mostFileCount: 1000,

			// Release resources if has not been used for 30 mins.
			releaseTimeoutMs: 30 * 60 * 1000,
		}, configuration, this.jsClassNameReferenceNameRegExp)

		this.cssServiceMap = new CSSServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobSharer,
			startPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// Track at most 1000 css files.
			mostFileCount: 1000,
		}, configuration)

		this.htmlServiceMap.bindCSSServiceMap(this.cssServiceMap)


		// All these events can't register for twice, or the first one will not work.

		documents.onDidChangeContent(async (event: TextDocumentChangeEvent<TextDocument>) => {
			let map = this.pickServiceMap(event.document)
			map?.onDocumentOpenOrContentChanged(event.document)

			// Update class name diagnostic results.
			if (configuration.enableClassNameDefinitionDiagnostic || configuration.enableClassNameReferenceDiagnostic) {
				await server.diagnoseOpenedOrChanged(event.document)
			}
		})

		documents.onDidSave((event: TextDocumentChangeEvent<TextDocument>) => {
			let map = this.pickServiceMap(event.document)
			map?.onDocumentSaved(event.document)
		})

		documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
			let map = this.pickServiceMap(event.document)
			map?.onDocumentClosed(event.document)
			this.diagnosedVersionMap.delete(event.document.uri)
		})

		connection.onDidChangeWatchedFiles((params: any) => {
			this.htmlServiceMap.onWatchedFileOrFolderChanged(params)
			this.cssServiceMap.onWatchedFileOrFolderChanged(params)
		})

		Logger.log(`📁 Server for workspace "${path.basename(this.options.workspaceFolderPath)}" started.`)
	}

	private pickServiceMap(document: TextDocument): HTMLServiceMap | CSSServiceMap | null {
		let uri = document.uri
		let documentExtension = getPathExtension(uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (isHTMLFile) {
			return this.htmlServiceMap
		}
		else if (isCSSFile) {
			return this.cssServiceMap
		}
		else {
			return null
		}
	}

	/** Get definitions by document and position. */
	async getDefinitions(document: TextDocument, position: Position): Promise<Location[] | null> {
		let offset = document.offsetAt(position)
		return findDefinitions(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Get references by document and position. */
	async getReferences(document: TextDocument, position: Position): Promise<Location[] | null> {
		let offset = document.offsetAt(position)
		return findReferences(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration, true)
	}

	private updateTimestamp(time: number) {
		this.htmlServiceMap.updateTimestamp(time)
		this.cssServiceMap.updateTimestamp(time)
	}

	/** Provide finding definitions service. */
	async provideDefinitions(params: TextDocumentPositionParams, time: number): Promise<Location[] | null> {
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
	async provideSymbols(symbol: WorkspaceSymbolParams, time: number): Promise<SymbolInformation[] | null> {
		this.updateTimestamp(time)

		let query = symbol.query

		// Returns nothing if haven't inputted.
		if (!query) {
			return null
		}

		let symbols: SymbolInformation[] = []
		symbols.push(...await this.cssServiceMap.findSymbols(query))

		if (configuration.enableGlobalEmbeddedCSS) {
			symbols.push(...await this.htmlServiceMap.findSymbols(query))
		}

		return symbols
	}

	/** Provide auto completion service for HTML or CSS document. */
	async provideCompletionItems(params: TextDocumentPositionParams, time: number): Promise<CompletionItem[] | null> {
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
	async provideReferences(params: ReferenceParams, time: number): Promise<Location[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		let position = params.position
		let offset = document.offsetAt(position)

		return findReferences(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration, false)
	}

	/** Provide finding hover service. */
	async provideHover(params: HoverParams, time: number): Promise<Hover | null> {
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

	/** Provide finding code lens service. */
	async provideCodeLens(params: CodeLensParams, time: number): Promise<CodeLens[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		return getCodeLens(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide document css variable color service. */
	async provideDocumentCSSVariableColors(params: DocumentColorParams, time: number): Promise<ColorInformation[] | null> {
		this.updateTimestamp(time)

		let documentIdentifier = params.textDocument
		let document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}
	
		return getCSSVariableColors(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Diagnose class names for a changed document. */
	async diagnoseOpenedOrChanged(document: TextDocument) {
		let documentExtension = getPathExtension(document.uri)
		let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (!isHTMLFile && !isCSSFile) {
			return
		}

		let previousVersion = this.diagnosedVersionMap.get(document.uri)
		let isChanged = previousVersion !== undefined && document.version > previousVersion
		let fileCount = 0
		let sharedCSSFragments = configuration.enableGlobalEmbeddedCSS

		Logger.timeStart('diagnostic-of-' + document.uri)

		try {
			let diagnostics = await this.getClassNameDiagnostics(document)
			if (diagnostics) {
				connection.sendDiagnostics({uri: document.uri, diagnostics})
				fileCount++
			}

			// Only when document content changed.
			if (isChanged) {
				if (isHTMLFile && configuration.enableClassNameReferenceDiagnostic) {
					fileCount += await this.diagnoseMoreOfType(sharedCSSFragments ? 'any' : 'css')
				}
				else if (isCSSFile && configuration.enableClassNameDefinitionDiagnostic) {
					fileCount += await this.diagnoseMoreOfType(sharedCSSFragments ? 'any' : 'html')
				}
			}
		}
		catch (err) {
			Logger.error(String(err))
		}

		Logger.timeEnd('diagnostic-of-' + document.uri, fileCount > 0 ? `${fileCount} files get diagnosed` : null)
	}

	/** After a css file changed, you may need to re-diagnostic all html files. */
	private async diagnoseMoreOfType(type: 'html' | 'css' | 'any'): Promise<number> {
		let fileCount = 0

		for (let document of documents.all()) {
			let documentExtension = getPathExtension(document.uri)
			let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
			let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

			if (type === 'html' && !isHTMLFile || type === 'css' && !isCSSFile) {
				continue
			}

			let diagnostics = await this.getClassNameDiagnostics(document)
			if (diagnostics) {
				connection.sendDiagnostics({uri: document.uri, diagnostics})
				fileCount++
			}
		}

		return fileCount
	}

	/** Get all class name diagnostics of a document. */
	private async getClassNameDiagnostics(document: TextDocument): Promise<Diagnostic[] | null> {
		this.diagnosedVersionMap.set(document.uri, document.version)
		return getDiagnostics(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}
}

