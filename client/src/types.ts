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
	enableCSSVariableColor: boolean
	enableLogLevelMessage: boolean

	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alwaysIncludeGlobPatterns: string[]

	ignoreSameNameCSSFile: boolean
	ignoreCustomAndComponentTagDefinition: boolean
	ignoreFilesBy: string[]

	maxHoverStylePropertyCount: number
}
