import {Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor} from './languages'
import {getPathExtension} from './helpers'


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

		locations = await findReferencesInHTML(fromPart, currentHTMLService)
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
	currentService: HTMLService
): Promise<Location[] | null> {
	if (!fromPart.isDefinitionType()) {
		return null
	}

	let locations: Location[] = []


	// Find HTML or CSS Variable references within current document.
	if (fromPart.isCSSType()) {
		locations.push(...currentService.findReferences(fromPart))
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
	if (!fromPart.isDefinitionType() && !fromPart.isCSSVariableType()) {
		return null
	}

	let locations: Location[] = []


	// Find HTML references across all html documents.
	if (fromPart.isSelectorType()) {
		locations.push(...await htmlServiceMap.findReferences(fromPart))
	}

	// Find CSS Variable references across all css documents.
	// Note it doesn't search HTML embedded css codes.
	// Otherwise css variable reference can also search reference.
	else if (fromPart.isCSSVariableType()) {
		let defPart = PartConvertor.toDefinitionMode(fromPart)
		locations.push(...await cssServiceMap.findReferences(defPart))
	}


	return locations
}
