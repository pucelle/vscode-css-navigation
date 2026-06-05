// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ambient global type, consumed across the client and server
interface InitializationOptions {
	workspaceFolderPath: string
	configuration: Configuration
}

interface Configuration {
	enableGoToDefinition: boolean
	enableWorkspaceSymbols: boolean
	enableCompletions: boolean
	enableCustomTagCompletion: boolean
	enableFindAllReferences: boolean
	enableHover: boolean
	enableDefinitionCodeLens: boolean
	enableReferenceCodeLens: boolean
	enableCSSVariableColorPreview: boolean
	enableClassNameDefinitionDiagnostic: boolean
	enableClassNameReferenceDiagnostic: boolean
	disableOwnCSSVariableCompletion: boolean
	enableLogLevelMessage: boolean

	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alwaysIncludeGlobPatterns: string[]
	jsClassNameReferenceNames: string[]

	ignoreCustomAndComponentTagDefinition: boolean
	ignoreFilesBy: string[]

	maxHoverStylePropertyCount: number
	enableGlobalEmbeddedCSS: boolean

	maxFileCount: number;
}
