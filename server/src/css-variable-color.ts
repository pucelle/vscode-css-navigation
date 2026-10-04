import {ColorInformation} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor, PartType} from './languages'
import {getPathExtension} from './utils'


/** Provide color previews for CSS variable references. */
export async function getCSSVariableColors(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<ColorInformation[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		return getCSSVariableColorsInAny(currentHTMLService, cssServiceMap, document)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		return await getCSSVariableColorsInAny(currentCSSService, cssServiceMap, document)
	}

	return null
}


/** For HTML or CSS file. */
async function getCSSVariableColorsInAny(
	currentService: HTMLService | CSSService,
	cssServiceMap: CSSServiceMap,
	document: TextDocument
): Promise<ColorInformation[]> {
	let parts = currentService.getPartsByType(PartType.CSSVariableReference)

	let variableNames = new Set(parts.map(part => part.escapedText))
	if (variableNames.size === 0) {
		return []
	}

	let variableMap = await getCSSVariableValues(currentService, cssServiceMap, variableNames)
	return makeColorInformation(parts, variableMap, document)
}


/** Load referenced variables and their alias dependencies, preferring the current document. */
async function getCSSVariableValues(
	currentService: HTMLService | CSSService,
	cssServiceMap: CSSServiceMap,
	variableNames: Set<string>
): Promise<Map<string, string>> {
	let variableMap = new Map<string, string>()
	let visited = new Set<string>()
	let pending = variableNames

	while (pending.size > 0) {

		// Search in local file.
		let localValues = currentService.getCSSVariables(pending)
		let missing = new Set([...pending].filter(name => !localValues.has(name)))

		// Search globally by local not found.
		let workspaceValues = missing.size > 0
			? await cssServiceMap.getCSSVariables(missing)
			: new Map<string, string>()

		let dependencies = new Set<string>()

		for (let name of pending) {
			visited.add(name)
		}

		for (let name of pending) {
			let value = localValues.get(name) ?? workspaceValues.get(name)
			if (!value) {
				continue
			}

			variableMap.set(name, value)

			// Collect newly discovered variables, and search next loop.
			let alias = getCSSVariableAlias(value)
			if (alias && !visited.has(alias)) {
				dependencies.add(alias)
			}
		}

		pending = dependencies
	}

	return variableMap
}


/** Build previews from resolved values, sharing alias results within this request. */
function makeColorInformation(parts: Part[], variableMap: Map<string, string>, document: TextDocument): ColorInformation[] {
	let items: ColorInformation[] = []
	let resolvedValues = new Map<string, string | null>()

	for (let part of parts) {
		let value = resolveCSSVariableValue(part.escapedText, variableMap, resolvedValues)
		if (!value) {
			continue
		}

		let info = PartConvertor.toColorInformation(part, value, document)
		if (info) {
			items.push(info)
		}
	}

	return items
}


/** 
 * Resolve css variable chains to get value at last.
 * It follows aliases iteratively so cycles and long chains cannot overflow the call stack.
  */
function resolveCSSVariableValue(
	name: string,
	variableMap: Map<string, string>,
	resolvedValues: Map<string, string | null>
): string | null {
	let visited = new Set<string>()
	let value: string | null = null

	while (!visited.has(name)) {
		if (resolvedValues.has(name)) {
			value = resolvedValues.get(name)!
			break
		}

		visited.add(name)
		let rawValue = variableMap.get(name)
		if (!rawValue) {
			break
		}

		let alias = getCSSVariableAlias(rawValue)
		if (alias) {
			name = alias
		}
		else {
			value = rawValue
			break
		}
	}

	for (let variableName of visited) {
		resolvedValues.set(variableName, value)
	}

	return value
}


/** Get the target of a complete var() alias; other values remain literal colors. */
function getCSSVariableAlias(value: string): string | null {
	return /^\s*var\(\s*(--[\w-]+)\s*\)\s*$/.exec(value)?.[1] ?? null
}
