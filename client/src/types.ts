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
	enableCSSVariableColorPreview: boolean
	enableClassNameDefinitionDiagnostic: boolean
	enableClassNameReferenceDiagnostic: boolean
	disableOwnCSSVariableCompletion: boolean
	enableLogLevelMessage: boolean

	activeHTMLFileExtensions: string[]
	activeCSSFileExtensions: string[]
	excludeGlobPatterns: string[]
	alwaysIncludeGlobPatterns: string[]

	ignoreCustomAndComponentTagDefinition: boolean
	ignoreFilesBy: string[]

	maxHoverStylePropertyCount: number
	enableSharedCSSFragments: boolean
}
