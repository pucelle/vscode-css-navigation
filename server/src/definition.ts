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
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let locations: LocationLink[] | null = null

	if (isHTMLFile) {
		const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		const fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		// No definition.
		if (fromPart.type === PartType.ClassPotential) {
			return null
		}

		locations = await findDefinitionsInHTML(fromPart, currentHTMLService, document, htmlServiceMap, cssServiceMap, configuration)
	}
	else if (isCSSFile) {
		const currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		const fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		locations = await findDefinitionsInCSS(fromPart, currentCSSService, document, cssServiceMap)
	}

	if (!locations) {
		return null
	}

	// Sort by the longest common subsequence.
	const items = locations.map(l => {
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
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<LocationLink[] | null> {
	const matchPart = PartConvertor.toDefinitionMode(fromPart)
	const contextMatchParts = currentService.getContextualDefMatchParts(fromPart)
	const locations: LocationLink[] = []


	// When mouse locates at `<link rel="stylesheet" href="|...|">` or `<style src="|...|">`, goto file start.
	if (fromPart.type === PartType.CSSImportPath) {
		const link = await PathResolver.resolveImportLocationLink(fromPart, document)
		if (!link) {
			return null
		}

		return [link]
	}


	// When mouse locates at `styleName="class-name"`, search within default imported css module.
	if (fromPart.type === PartType.ReactDefaultImportedCSSModuleClass) {
		const filePaths = await ModuleResolver.resolveReactDefaultCSSModuleURIs(document)
		const services: CSSService[] = []

		for (const filePath of filePaths) {
			const cssModuleService = await cssServiceMap.forceGetServiceByURI(filePath)
			if (cssModuleService) {
				services.push(cssModuleService)
			}
		}

		return cssServiceMap.findDefinitionsFromServices(services, matchPart, fromPart, document, contextMatchParts)
	}


	// When mouse locates at `class={style.className}`, search within specified named imported css module.
	if (fromPart.type === PartType.ImportedCSSModuleProperty) {
		const importedCSSModulePart = currentService.findPreviousPart(fromPart)
		if (!importedCSSModulePart || importedCSSModulePart.type !== PartType.ImportedCSSModuleName) {
			return null
		}

		const uri = await ModuleResolver.resolveReactCSSModuleURIByName(importedCSSModulePart.escapedText, document)
		if (!uri) {
			return null
		}

		const cssModuleService = await cssServiceMap.forceGetServiceByURI(uri)
		if (!cssModuleService) {
			return null
		}

		return cssServiceMap.findDefinitionsFromServices([cssModuleService], matchPart, fromPart, document, contextMatchParts)
	}


	// Must be reference type.
	if (!fromPart.isReferenceType()) {
		return null
	}


	// If custom tag, and should ignore.
	if (fromPart.type === PartType.Tag) {
		if (configuration.ignoreCustomAndComponentTagDefinition &&
			fromPart.escapedText.includes('-')
		) {
			return null
		}
	}


	// Find embedded style definitions or definitions from all imported css files, if any found, stop.
	locations.push(...await findEmbeddedOrImported(matchPart, fromPart, currentService, document, cssServiceMap, contextMatchParts))
	if (locations.length > 0) {
		return locations
	}
	

	// Search across all CSS files.
	locations.push(...await cssServiceMap.findDefinitions(matchPart, fromPart, document, contextMatchParts))
	if (locations.length > 0) {
		return locations
	}


	// Find css fragments in HTML.
	if (configuration.enableGlobalEmbeddedCSS) {
		locations.push(...await htmlServiceMap.findDefinitions(matchPart, fromPart, document, contextMatchParts))
	}


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
		const link = await PathResolver.resolveImportLocationLink(fromPart, document)
		if (!link) {
			return null
		}

		return [link]
	}


	if (!fromPart.isReferenceType()) {
		return null
	}


	const matchPart = PartConvertor.toDefinitionMode(fromPart)
	const locations: LocationLink[] = []


	// For `var(--variable-name)`, find at current document or imported.
	if (fromPart.isCSSVariableType()) {
		locations.push(...await findEmbeddedOrImported(matchPart, fromPart, currentService, document, cssServiceMap))
		
		if (locations.length > 0) {
			return locations
		}

		// Search across all css files.
		locations.push(...await cssServiceMap.findDefinitions(matchPart, fromPart, document))
	}


	return locations
}


async function findEmbeddedOrImported(
	matchPart: Part,
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap,
	contextMatchParts: readonly Part[] = []
): Promise<LocationLink[]> {
	// Load imported services before choosing between contextual and normal definitions.
	const cssURIs = await currentService.getImportedCSSURIs()
	const cssURIChain = cssServiceMap.trackingMap.resolveChainedImportedURIs(cssURIs)
	const importedServices: CSSService[] = []

	for (const cssURI of cssURIChain) {
		const cssService = await cssServiceMap.forceGetServiceByURI(cssURI)
		if (!cssService) {
			continue
		}
		importedServices.push(cssService)
	}

	return cssServiceMap.findDefinitionsFromServices(
		[currentService, ...importedServices],
		matchPart,
		fromPart,
		document,
		contextMatchParts,
	)
}
