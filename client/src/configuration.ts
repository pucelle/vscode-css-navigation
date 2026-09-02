export const RestartRequiredConfigurationNames = [
	'activeHTMLFileExtensions',
	'activeCSSFileExtensions',
	'excludeGlobPatterns',
	'alwaysIncludeGlobPatterns',
	'searchAcrossWorkspaceFolders',
	'ignoreFilesBy',
	'maxFileCount',
	'jsClassNameReferenceNames',
	'enableGlobalEmbeddedCSS',
] as const


/** Test whether changed configuration will cause server restart. */
export function shouldRestartForConfigurationChange(affectsConfiguration: (section: string) => boolean): boolean {
	return RestartRequiredConfigurationNames.some(name => affectsConfiguration(`CSSNavigation.${name}`))
}
