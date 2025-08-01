import {Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor, PartType} from './languages'
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
		if (!currentHTMLService) {
			return null
		}

		let fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		// No hover.
		if (fromPart.type === PartType.ClassPotential) {
			return null
		}

		return await findHoverInHTML(fromPart, currentHTMLService, document, htmlServiceMap, cssServiceMap, configuration)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		let fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await findHoverInCSS(fromPart, currentCSSService, document, cssServiceMap, configuration)
	}

	return null
}


/** Find hover in HTML or CSS files. */
async function findHoverInHTML(
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Hover | null> {
	if (!fromPart.isReferenceType()) {
		return null
	}

	let hover: Hover | null = null
	let matchPart = PartConvertor.toDefinitionMode(fromPart)


	if (fromPart.isSelectorType() || fromPart.isCSSVariableType()) {

		// Find within current document.
		hover = await findEmbeddedOrImported(matchPart, fromPart, currentService, document, cssServiceMap, configuration)
		if (hover) {
			return hover
		}


		// Find across all css documents.
		hover = await cssServiceMap.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
		if (hover) {
			return hover
		}


		// Find across all html documents.
		if (configuration.enableSharedCSSFragments) {
			hover = await htmlServiceMap.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
			if (hover) {
				return hover
			}
		}
	}

	return null
}



/** Find hover in HTML or CSS files. */
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

	let hover: Hover | null = null
	let matchPart = PartConvertor.toDefinitionMode(fromPart)

	if (fromPart.isCSSVariableType()) {

		// Find within current document.
		hover = await findEmbeddedOrImported(matchPart, fromPart, currentService, document, cssServiceMap, configuration)
		if (hover) {
			return hover
		}


		// Find across all css documents.
		hover = await cssServiceMap.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
		if (hover) {
			return hover
		}
	}
	return null
}


async function findEmbeddedOrImported(
	matchPart: Part,
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Hover | null> {

	// Find embedded hover.
	let hover = currentService.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
	if (hover) {
		return hover
	}
	

	// Having CSS files imported, firstly search within these files, if found, not searching more.
	let cssURIs = await currentService.getImportedCSSURIs()
	let cssURIChain = cssServiceMap.trackingMap.resolveChainedImportedURIs(cssURIs)

	for (let cssURI of cssURIChain) {
		let cssService = await cssServiceMap.forceGetServiceByURI(cssURI)
		if (!cssService) {
			continue
		}

		let hover = cssService.findHover(matchPart, fromPart, document, configuration.maxHoverStylePropertyCount)
		if (hover) {
			return hover
		}
	}


	return null
}