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
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

	if (isHTMLFile) {
		const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		return getCSSVariableColorsInAny(currentHTMLService, cssServiceMap, document)
	}
	else if (isCSSFile) {
		const currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
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
	const parts = currentService.getPartsByType(PartType.CSSVariableReference)

	const variableNames = new Set(parts.map(part => part.escapedText))
	if (variableNames.size === 0) {
		return []
	}

	const currentVariableMap = currentService.getCSSVariables(variableNames)

	// Stop searching if find all within current document.
	if (currentVariableMap.size === variableNames.size) {
		return makeColorInformation(parts, currentVariableMap, document)
	}

	const variableMap = await cssServiceMap.getCSSVariables(variableNames)
	return makeColorInformation(parts, variableMap, document)
}


function makeColorInformation(parts: Part[], variableMap: Map<string, string>, document: TextDocument): ColorInformation[] {
	const items: ColorInformation[] = []

	for (const part of parts) {
		const value = variableMap.get(part.escapedText)
		if (!value) {
			continue
		}

		const info = PartConvertor.toColorInformation(part, value, document)
		if (info) {
			items.push(info)
		}
	}

	return items
}