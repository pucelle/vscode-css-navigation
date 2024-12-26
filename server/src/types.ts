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
	alwaysIncludeGlobPatterns: string[]
	alwaysIncludeImportedFiles: boolean
	ignoreSameNameCSSFile: boolean
	ignoreCustomElement: boolean
	ignoreFilesBy: string[]
	ignoreFilesInNPMIgnore: boolean
	enableLogLevelMessage: boolean
}