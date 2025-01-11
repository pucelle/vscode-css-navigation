import {Location, LocationLink} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, ModuleResolver, Part, PartConvertor, PartType, PathResolver} from './languages'
import {getPathExtension, getLongestCommonSubsequenceLength} from './utils'


/** Provide finding definitions service. */
export async function findDefinitions(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Location[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let locations: LocationLink[] | null = null

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findDefinitionsInHTML(fromPart, currentHTMLService, document, cssServiceMap, configuration)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		let fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findDefinitionsInCSS(fromPart, currentCSSService, document, cssServiceMap)
	}

	if (!locations) {
		return null
	}

	// Sort by the longest common subsequence.
	let items = locations.map(l => {
		return {
			location: l,
			subsequence: getLongestCommonSubsequenceLength(l.targetUri, document.uri),
		}
	})

	items.sort((a, b) => {
		return a.subsequence - b.subsequence
	})

	return items.map(item => {
		return Location.create(item.location.targetUri, item.location.targetRange)
	})
}


/** In HTML files, or files that can include HTML codes. */
async function findDefinitionsInHTML(
	fromPart: Part,
	currentService: HTMLService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<LocationLink[] | null> {
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let locations: LocationLink[] = []


	// When mouse locates at `<link rel="stylesheet" href="|...|">` or `<style src="|...|">`, goto file start.
	if (fromPart.type === PartType.CSSImportPath) {
		let link = await PathResolver.resolveImportLocationLink(fromPart, document)
		if (!link) {
			return null
		}

		return [link]
	}


	// When mouse locates at `styleName="class-name"`, search within default imported css module.
	if (fromPart.type === PartType.ReactDefaultImportedCSSModuleClass) {
		let filePaths = await ModuleResolver.resolveReactDefaultCSSModulePaths(document)

		for (let filePath of filePaths) {
			let cssModuleService = await cssServiceMap.forceGetServiceByFilePath(filePath)
			if (!cssModuleService) {
				return null
			}

			let defs = cssModuleService.findDefinitions(matchPart, fromPart, document)
			if (defs.length > 0) {
				return defs
			}
		}

		return null
	}


	// When mouse locates at `class={style.className}`, search within specified named imported css module.
	if (fromPart.type === PartType.ReactImportedCSSModuleProperty) {
		let importedCSSModulePart = currentService.findPreviousPart(fromPart)
		if (!importedCSSModulePart || importedCSSModulePart.type !== PartType.ReactImportedCSSModuleName) {
			return null
		}

		let filePath = await ModuleResolver.resolveReactCSSModuleByName(importedCSSModulePart.text, document)
		if (!filePath) {
			return null
		}

		let cssModuleService = await cssServiceMap.forceGetServiceByFilePath(filePath)
		if (!cssModuleService) {
			return null
		}

		return cssModuleService.findDefinitions(matchPart, fromPart, document)
	}


	// Must be reference type.
	if (!fromPart.isReferenceType()) {
		return null
	}


	// If custom tag or component tag, and should ignore.
	if (fromPart.type === PartType.Tag) {
		if (configuration.ignoreCustomAndComponentTagDefinition &&
			(fromPart.text.includes('-') || /^[A-Z]/.test(fromPart.text))
		) {
			return null
		}
	}

	
	// Skip component tag.
	if (fromPart.type === PartType.Tag && /^[A-Z]/.test(fromPart.text)) {
		return null
	}


	// Try to find definition from split view, but can't visit `vscode` module from language server.
	// let visibleEditors = vscode.window.visibleTextEditors

	// let cssVisibleEditors = visibleEditors.filter(e => e.document.uri.toString() !== document.uri
	// 	&& configuration.activeCSSFileExtensions.includes(getPathExtension(e.document.uri.toString()))
	// )

	// for (let cssEditor of cssVisibleEditors) {
	// 	let cssURI = cssEditor.document.uri.toString()
	// 	let cssService = await this.cssServiceMap.forceGetServiceByURI(cssURI)
	// 	if (!cssService) {
	// 		continue
	// 	}

	// 	locations.push(...cssService.findDefinitions(matchPart, fromPart, document))
	// }

	// if (locations.length > 0) {
	// 	return locations
	// }


	// Find embedded style definitions or definitions from all imported css files, if any found, stop.
	locations.push(...await findEmbeddedOrImported(currentService, matchPart, fromPart, document, cssServiceMap))
	if (locations.length > 0) {
		return locations
	}
	

	// Search across all CSS files.
	locations.push(...await cssServiceMap.findDefinitions(matchPart, fromPart, document))


	return locations
}


/** In CSS files, or a sass file. */
async function findDefinitionsInCSS(
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap
): Promise<LocationLink[] | null> {

	// When mouse locates at `@import`, goto file start.
	if (fromPart.type === PartType.CSSImportPath) {
		let link = await PathResolver.resolveImportLocationLink(fromPart, document)
		if (!link) {
			return null
		}

		return [link]
	}


	if (!fromPart.isReferenceType()) {
		return null
	}


	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let locations: LocationLink[] = []


	// When mouse locates at `var(--variable-name)`, goto file start.
	if (fromPart.isCSSVariableType()) {
		
		// Find embedded style definitions or definitions from all imported css files, if any found, stop.
		locations.push(...await findEmbeddedOrImported(currentService, matchPart, fromPart, document, cssServiceMap))
		
		if (locations.length > 0) {
			return locations
		}


		// Search across all css files.
		locations.push(...await cssServiceMap.findDefinitions(matchPart, fromPart, document))
	}

	return locations
}


async function findEmbeddedOrImported(
	currentService: HTMLService | CSSService,
	matchPart: Part,
	fromPart: Part,
	document: TextDocument,
	cssServiceMap: CSSServiceMap
): Promise<LocationLink[]> {
	let locations: LocationLink[] = []

	// Find embedded style definitions, if found, stop.
	locations.push(...currentService.findDefinitions(matchPart, fromPart, document))

	if (locations.length > 0) {
		return locations
	}
	

	// Having CSS files imported, firstly search within these files, if found, not searching more.
	let cssURIs = await currentService.getImportedCSSURIs()
	let cssURIChain = cssServiceMap.trackingMap.resolveChainedImportedURIs(cssURIs)

	for (let cssURI of cssURIChain) {
		let cssService = await cssServiceMap.forceGetServiceByURI(cssURI)
		if (!cssService) {
			continue
		}

		locations.push(...cssService.findDefinitions(matchPart, fromPart, document))
	}

	if (locations.length > 0) {
		return locations
	}

	return locations
}