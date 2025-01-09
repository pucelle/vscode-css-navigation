import {Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor} from './languages'
import {getPathExtension} from './utils'


/** Provide finding hover service. */
export async function findHover(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Hover | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await findHoverInAny(fromPart, currentHTMLService, document, cssServiceMap, configuration)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await findHoverInAny(fromPart, currentCSSService, document, cssServiceMap, configuration)
	}

	return null
}


/** Find hover in HTML or CSS files. */
async function findHoverInAny(
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Hover | null> {
	if (!fromPart.isReferenceType()) {
		return null
	}


	let matchPart = PartConvertor.toDefinitionMode(fromPart)


	// Find within current document.
	let hover = currentService.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
	if (hover) {
		return hover
	}


	// Find across all css documents.
	if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {
		hover = await cssServiceMap.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
	}

	if (hover) {
		return hover
	}

	return null
}
