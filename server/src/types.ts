interface InitializationOptions {
	workspaceFolderPath: string
	configuration: Configuration
}

interface Configuration {
	enableGoToDefinition: boolean
	enableWorkspaceSymbols: boolean
	enableIdAndClassNameCompletion: boolean
	enableFindAllReferences: boolean
	enableHover: boolean
	enableLogLevelMessage: boolean
	
	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alwaysIncludeGlobPatterns: string[]
	ignoreSameNameCSSFile: boolean
	ignoreCustomElement: boolean
	ignoreFilesBy: string[]
	ignoreFilesInNPMIgnore: boolean
}