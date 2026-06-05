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
	configuration: Configuration,
	pureReference: boolean
): Promise<Location[] | null> {
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let locations: Location[] | null = null

	if (isHTMLFile) {
		const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		const fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		// No reference.
		if (fromPart.type === PartType.ClassPotential) {
			return null
		}

		locations = await findReferencesInHTML(fromPart, currentHTMLService, htmlServiceMap, cssServiceMap, configuration, pureReference)
	}
	else if (isCSSFile) {
		const currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		const fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findReferencesInCSS(fromPart, currentCSSService, htmlServiceMap, cssServiceMap, pureReference)
	}

	return locations
}


/** In HTML files, or files that can include HTML codes. */
async function findReferencesInHTML(
	fromPart: Part,
	currentService: HTMLService,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
	pureReference: boolean
): Promise<Location[] | null> {
	const matchPart = PartConvertor.toDefinitionMode(fromPart)
	const locations: Location[] = []


	if (pureReference) {
		if (fromPart.isDefinitionType()) {
			if (configuration.enableGlobalEmbeddedCSS) {
				locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
			}
			else {
				locations.push(...currentService.findReferences(matchPart, fromPart))
			}
		}
	}

	// Find for both definition and reference parts by default.
	else {
		if (fromPart.isDefinitionType() || fromPart.isReferenceType()) {
			locations.push(...await cssServiceMap.findReferences(matchPart, fromPart))

			if (configuration.enableGlobalEmbeddedCSS) {
				locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
			}
			else {
				locations.push(...currentService.findReferences(matchPart, fromPart))
			}
		}
	}


	return locations
}


/** In CSS files, or a sass file. */
async function findReferencesInCSS(
	fromPart: Part,
	_currentService: HTMLService | CSSService,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	pureReference: boolean
): Promise<Location[] | null> {
	const matchPart = PartConvertor.toDefinitionMode(fromPart)
	const locations: Location[] = []


	if (pureReference) {
		if (fromPart.isDefinitionType()) {
			locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
		}
	}

	// Find for both definition and reference parts by default.
	else if (fromPart.isDefinitionType() || fromPart.isReferenceType()) {
		locations.push(...await cssServiceMap.findReferences(matchPart, fromPart))
		locations.push(...await htmlServiceMap.findReferences(matchPart, fromPart))
	}


	return locations
}
