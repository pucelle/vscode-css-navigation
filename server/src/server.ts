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
	CodeLensParams,
	CodeActionParams,
	CodeAction,
} from 'vscode-languageserver/node'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLServiceMap, CSSServiceMap, ClassNamesInJS} from './languages'
import {generateGlobPatternByExtensions, generateGlobPatternByPatterns, getPathExtension} from './utils'
import {Ignore, Logger} from './core'
import {findDefinitions} from './definition'
import {getCompletionItems} from './completion'
import {findReferences} from './reference'
import {findHover} from './hover'
import {getCSSVariableColors} from './css-variable-color'
import {getDiagnostics} from './diagnostic'
import {getCodeLens} from './code-lens'
import {GlobPathSharer} from './core/file-tracker/glob-path-sharer'
import {getCodeActions} from './code-action'


const connection: Connection = createConnection(ProposedFeatures.all)
let configuration: Configuration
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
let server: CSSNavigationServer



//////// Debug Help
// 1. How to inspect textmate tokens: Ctrl + Shift + P, then choose `Inspect Editor Tokens and Scopes`
// 2. How to inspect completion details: Ctrl + /


// Server side request handlers.
connection.onRequest('definitions', async({uri, position}: {uri: string, position: Position}) => {
	const document = documents.get(uri)
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
	const document = documents.get(uri)
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
	const options = params.initializationOptions as InitializationOptions
	configuration = options.configuration
	server = new CSSNavigationServer(options)


	// Initialize console channel and log level.
	Logger.setLogEnabled(configuration.enableLogLevelMessage)
	Logger.pipeTo(connection)


	// Print error messages after unhandled rejection promise.
	process.on('unhandledRejection', function(reason) {
		Logger.warn("Unhandled Rejection: " + String(reason))
	})


	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full
			},
			completionProvider: {
				resolveProvider: false,

				// #: id
				// .: class or css module dot
				// -: css variable
				// [: before css module property
				// '": css module property
				triggerCharacters: ['.', '#', '-', '[', '"', "'"],
			},
			definitionProvider: true,
			referencesProvider: true,
			workspaceSymbolProvider: true,
			hoverProvider: true,
			codeLensProvider: {resolveProvider: false},
			colorProvider: true,
			codeActionProvider: true,
		}
	}
})

// Listening events.
connection.onInitialized(() => {
	connection.onDefinition(Logger.logQuerierExecutedTime(server.provideDefinitions.bind(server), 'definition'))
	connection.onWorkspaceSymbol(Logger.logQuerierExecutedTime(server.provideSymbols.bind(server), 'workspace symbol'))
	connection.onCompletion(Logger.logQuerierExecutedTime(server.provideCompletionItems.bind(server), 'completion'))
	connection.onReferences(Logger.logQuerierExecutedTime(server.provideReferences.bind(server), 'reference'))
	connection.onHover(Logger.logQuerierExecutedTime(server.provideHover.bind(server), 'hover'))
	connection.onCodeLens(Logger.logQuerierExecutedTime(server.provideCodeLens.bind(server), 'codeLens'))
	connection.onCodeAction(server.provideCodeActions.bind(server))
	connection.onDocumentColor(async (params) => {
		try {
			return await server.provideDocumentCSSVariableColors(params, Logger.getTimestamp())
		}
		catch (err) {
			Logger.error(String(err))
			return []
		}
	})

	// Just ensure no error happens.
	connection.onColorPresentation(() => [])
})

connection.onDidChangeConfiguration(params => {
	void server.onUpdatedConfiguration(params.settings as Configuration)
})

documents.listen(connection)
connection.listen()



class CSSNavigationServer {

	private options: InitializationOptions
	private cssServiceMap: CSSServiceMap
	private htmlServiceMap: HTMLServiceMap
	private diagnosedVersionMap: Map<string, number> = new Map()

	constructor(options: InitializationOptions) {
		this.options = options
		ClassNamesInJS.initWildNames(configuration.jsClassNameReferenceNames)
		
		const startPath = options.workspaceFolderPath
		
		const alwaysIncludeGlobPattern = configuration.alwaysIncludeGlobPatterns
			? generateGlobPatternByPatterns(configuration.alwaysIncludeGlobPatterns)
			: undefined

		// Shared glob querying.
		const alwaysIncludeGlobSharer = alwaysIncludeGlobPattern ? new GlobPathSharer(alwaysIncludeGlobPattern, startPath) : undefined

		const maxFileCount = configuration.maxFileCount;

		this.htmlServiceMap = new HTMLServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeHTMLFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobSharer,
			startPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// By default track at most 1000 html like files.
			maxFileCount,

			// Release resources if has not been used for 30 mins.
			releaseTimeoutMs: 30 * 60 * 1000,
		}, configuration)

		this.cssServiceMap = new CSSServiceMap(documents, connection.window, {
			includeFileGlobPattern: generateGlobPatternByExtensions(configuration.activeCSSFileExtensions)!,
			excludeGlobPattern: generateGlobPatternByPatterns(configuration.excludeGlobPatterns) || undefined,
			alwaysIncludeGlobSharer,
			startPath,
			ignoreFilesBy: configuration.ignoreFilesBy as Ignore[],

			// By default track at most 1000 css files.
			maxFileCount,
		}, configuration)

		this.htmlServiceMap.bindCSSServiceMap(this.cssServiceMap)


		// All these events can't register for twice, or the first one will not work.

		documents.onDidChangeContent(async (event: TextDocumentChangeEvent<TextDocument>) => {
			const map = this.pickServiceMap(event.document)
			map?.onDocumentOpenOrContentChanged(event.document)

			// Update class name diagnostic results.
			if (configuration.enableClassNameDefinitionDiagnostic || configuration.enableClassNameReferenceDiagnostic) {
				await server.diagnoseOpenedOrChanged(event.document)
			}
		})

		documents.onDidSave((event: TextDocumentChangeEvent<TextDocument>) => {
			const map = this.pickServiceMap(event.document)
			map?.onDocumentSaved(event.document)
		})

		documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
			const map = this.pickServiceMap(event.document)
			map?.onDocumentClosed(event.document)
			this.diagnosedVersionMap.delete(event.document.uri)
		})

		connection.onDidChangeWatchedFiles((params) => {
			void this.htmlServiceMap.onWatchedFileOrFolderChanged(params)
			void this.cssServiceMap.onWatchedFileOrFolderChanged(params)
		})

		Logger.log(`📁 Server for workspace "${path.basename(this.options.workspaceFolderPath)}" started.`)
	}

	private pickServiceMap(document: TextDocument): HTMLServiceMap | CSSServiceMap | null {
		const uri = document.uri
		const documentExtension = getPathExtension(uri)
		const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

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
		const offset = document.offsetAt(position)
		return findDefinitions(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Get references by document and position. */
	async getReferences(document: TextDocument, position: Position): Promise<Location[] | null> {
		const offset = document.offsetAt(position)
		return findReferences(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration, true)
	}

	private updateTimestamp(time: number) {
		this.htmlServiceMap.updateTimestamp(time)
		this.cssServiceMap.updateTimestamp(time)
	}

	/** Provide finding definitions service. */
	async provideDefinitions(params: TextDocumentPositionParams, time: number): Promise<Location[] | null> {
		if (!configuration.enableGoToDefinition) {
			return null
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		const position = params.position
		const offset = document.offsetAt(position)

		return findDefinitions(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding symbol service. */
	async provideSymbols(symbol: WorkspaceSymbolParams, time: number): Promise<SymbolInformation[] | null> {
		if (!configuration.enableWorkspaceSymbols) {
			return null
		}

		this.updateTimestamp(time)

		const query = symbol.query

		// Returns nothing if haven't inputted.
		if (!query) {
			return null
		}

		const symbols: SymbolInformation[] = []
		symbols.push(...await this.cssServiceMap.findSymbols(query))

		if (configuration.enableGlobalEmbeddedCSS) {
			symbols.push(...await this.htmlServiceMap.findSymbols(query))
		}

		return symbols
	}

	/** Provide auto completion service for HTML or CSS document. */
	async provideCompletionItems(params: TextDocumentPositionParams, time: number): Promise<CompletionItem[] | null> {
		if (!configuration.enableCompletions) {
			return null
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		// HTML or CSS file.
		const position = params.position
		const offset = document.offsetAt(position)

		return getCompletionItems(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding reference service. */
	async provideReferences(params: ReferenceParams, time: number): Promise<Location[] | null> {
		if (!configuration.enableFindAllReferences) {
			return null
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		const position = params.position
		const offset = document.offsetAt(position)

		return findReferences(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration, false)
	}

	/** Provide finding hover service. */
	async provideHover(params: HoverParams, time: number): Promise<Hover | null> {
		if (!configuration.enableHover) {
			return null
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		const position = params.position
		const offset = document.offsetAt(position)
		
		return findHover(document, offset, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide finding code lens service. */
	async provideCodeLens(params: CodeLensParams, time: number): Promise<CodeLens[] | null> {
		if (!configuration.enableDefinitionCodeLens && !configuration.enableReferenceCodeLens) {
			return null
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return null
		}

		return getCodeLens(document, this.htmlServiceMap, this.cssServiceMap, configuration)
	}

	/** Provide document css variable color service. */
	async provideDocumentCSSVariableColors(params: DocumentColorParams, time: number): Promise<ColorInformation[]> {
		if (!configuration.enableCSSVariableColorPreview) {
			return []
		}

		this.updateTimestamp(time)

		const documentIdentifier = params.textDocument
		const document = documents.get(documentIdentifier.uri)

		if (!document) {
			return []
		}

		return (await getCSSVariableColors(document, this.htmlServiceMap, this.cssServiceMap, configuration)) ?? []
	}

	/** Provide code action for ignore class name diagnostics. */
	provideCodeActions(params: CodeActionParams): CodeAction[] {
		return getCodeActions(params)
	}

	/** Apply settings that don't require rebuilding the tracked workspace. */
	async onUpdatedConfiguration(nextConfiguration: Configuration) {
		const shouldRefreshDiagnostics
			= configuration.enableClassNameDefinitionDiagnostic !== nextConfiguration.enableClassNameDefinitionDiagnostic
				|| configuration.enableClassNameReferenceDiagnostic !== nextConfiguration.enableClassNameReferenceDiagnostic
				|| !sameStringArray(
					configuration.diagnosticIgnoredClassNames,
					nextConfiguration.diagnosticIgnoredClassNames,
				)

		Object.assign(configuration, nextConfiguration)
		Logger.setLogEnabled(configuration.enableLogLevelMessage)

		if (shouldRefreshDiagnostics) {
			for (const document of documents.all()) {
				const diagnostics = await this.getClassNameDiagnostics(document)
				void connection.sendDiagnostics({uri: document.uri, diagnostics: diagnostics ?? []})
			}
		}
	}

	/** Diagnose class names for a changed document. */
	async diagnoseOpenedOrChanged(document: TextDocument) {
		const documentExtension = getPathExtension(document.uri)
		const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
		const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

		if (!isHTMLFile && !isCSSFile) {
			return
		}

		const previousVersion = this.diagnosedVersionMap.get(document.uri)
		const isChanged = previousVersion !== undefined && document.version > previousVersion
		let fileCount = 0
		const sharedCSSFragments = configuration.enableGlobalEmbeddedCSS

		Logger.timeStart('diagnostic-of-' + document.uri)

		try {
			const diagnostics = await this.getClassNameDiagnostics(document)
			if (diagnostics) {
				void connection.sendDiagnostics({uri: document.uri, diagnostics})
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

		for (const document of documents.all()) {
			const documentExtension = getPathExtension(document.uri)
			const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
			const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

			if (type === 'html' && !isHTMLFile || type === 'css' && !isCSSFile) {
				continue
			}

			const diagnostics = await this.getClassNameDiagnostics(document)
			if (diagnostics) {
				void connection.sendDiagnostics({uri: document.uri, diagnostics})
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


function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index])
}
