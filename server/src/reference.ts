import {Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor, PartType} from './languages'
import {getPathExtension} from './utils'


/** Provide finding references service. */
export async function findReferences(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Location[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let locations: Location[] | null = null

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findReferencesInHTML(fromPart, currentHTMLService, htmlServiceMap, cssServiceMap)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findReferencesInCSS(fromPart, currentCSSService, htmlServiceMap, cssServiceMap)
	}

	return locations
}


/** In HTML files, or files that can include HTML codes. */
async function findReferencesInHTML(
	fromPart: Part,
	_currentService: HTMLService,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap
): Promise<Location[] | null> {
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let locations: Location[] = []


	// Skip component tag.
	if (fromPart.type === PartType.Tag && /^[A-Z]/.test(fromPart.text)) {
		return null
	}


	// Find CSS Selector and CSS Variable across all HTML & CSS documents.
	if (fromPart.isDefinitionType() || fromPart.isReferenceType()) {
		locations.push(...await cssServiceMap.findReferences(matchPart, fromPart))
		locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
	}


	return locations
}


/** In CSS files, or a sass file. */
async function findReferencesInCSS(
	fromPart: Part,
	_currentService: HTMLService | CSSService,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap
): Promise<Location[] | null> {
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let locations: Location[] = []


	// Find CSS Selector and CSS Variable across all HTML & CSS documents.
	if (fromPart.isDefinitionType() || fromPart.isReferenceType()) {
		locations.push(...await cssServiceMap.findReferences(matchPart, fromPart))
		locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
	}


	return locations
}
