import {ColorInformation} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor, PartType} from './languages'
import {getPathExtension} from './utils'


/** Provide finding hover service. */
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

	let currentVariableMap = currentService.getCSSVariables(variableNames)

	// Stop searching if find all within current document.
	if (currentVariableMap.size === variableNames.size) {
		return makeColorInformation(parts, currentVariableMap, document)
	}

	let variableMap = await cssServiceMap.getCSSVariables(variableNames)
	return makeColorInformation(parts, variableMap, document)
}


function makeColorInformation(parts: Part[], variableMap: Map<string, string>, document: TextDocument): ColorInformation[] {
	let items: ColorInformation[] = []

	for (let part of parts) {
		let value = variableMap.get(part.escapedText)
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