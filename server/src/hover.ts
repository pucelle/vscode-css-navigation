import {Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor} from './languages'
import {getPathExtension} from './helpers'


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

		return await findHoverInHTML(fromPart, currentHTMLService, cssServiceMap, document, configuration)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await findHoverInCSS(fromPart, currentCSSService, document, cssServiceMap, configuration)
	}

	return null
}


/** In HTML files, or files that can include HTML codes. */
async function findHoverInHTML(
	fromPart: Part,
	currentService: HTMLService,
	cssServiceMap: CSSServiceMap,
	document: TextDocument,
	configuration: Configuration
): Promise<Hover | null> {
	let matchPart = PartConvertor.toDefinitionMode(fromPart)


	// Find within current document.
	let hover = currentService.findHover(matchPart, document, configuration.maxHoverStylePropertyCount)
	if (hover) {
		return hover
	}


	// Find across all css documents.
	if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {
		hover = await cssServiceMap.findHover(matchPart, document, configuration.maxHoverStylePropertyCount)
	}

	if (hover) {
		return hover
	}

	return null
}


/** In CSS files, or a sass file. */
async function findHoverInCSS(
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
	let hover = currentService.findHover(matchPart, document, configuration.maxHoverStylePropertyCount)
	if (hover) {
		return hover
	}


	// Find across all css documents.
	if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {
		hover = await cssServiceMap.findHover(matchPart, document, configuration.maxHoverStylePropertyCount)
	}

	return null
}
