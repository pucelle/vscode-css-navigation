import {CodeLens} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSServiceMap, HTMLServiceMap, PartType} from './languages'
import {getPathExtension} from './utils'
import {CSSSelectorDetailedPart} from './languages/parts/part-css-selector-detailed'
import {URI} from 'vscode-uri'


/** Provide class name CodeLens service. */
export async function getCodeLens(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<CodeLens[] | null> {
	
	// No code lens for remote source.
	if (URI.parse(document.uri).scheme !== 'file') {
		return null
	}

	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let codeLens: CodeLens[] = []

	if (isHTMLFile && configuration.enableDefinitionCodeLens) {
		let diags = await getDefinitionCodeLens(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			codeLens.push(...diags)
		}
	}

	if ((isHTMLFile || isCSSFile) && configuration.enableReferenceCodeLens) {
		let diags = await getReferencedCodeLens(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			codeLens.push(...diags)
		}
	}

	return codeLens
}


/** Provide defined class name code lens service. */
async function getDefinitionCodeLens(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<CodeLens[] | null> {
	let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
	if (!currentHTMLService) {
		return null
	}

	let codeLens: CodeLens[] = []

	let classNameParts = [
		...currentHTMLService.getPartsByType(PartType.Class),
		...currentHTMLService.getPartsByType(PartType.ReactDefaultImportedCSSModuleClass),
		...currentHTMLService.getPartsByType(PartType.ReactImportedCSSModuleProperty),
	]

	if (!classNameParts || classNameParts.length === 0) {
		return codeLens
	}

	await cssServiceMap.beFresh()

	if (configuration.enableGlobalEmbeddedCSS) {
		await htmlServiceMap.beFresh()
	}

	for (let part of classNameParts) {

		// Without identifier.
		let className = part.escapedText
		let count = 0

		count += cssServiceMap.getDefinedClassNameCount(className)

		if (configuration.enableGlobalEmbeddedCSS) {
			count += htmlServiceMap.getDefinedClassName(className)
		}
		else {
			count += currentHTMLService.getDefinedClassNameCount(className)
		}

		if (count > 0) {
			codeLens.push({
				range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
				command: {
					title: count > 1 ? `${count} definitions` : `${count} definition`,
					command: `CSSNavigation.peekDefinitions`,
					arguments: [document.uri, document.positionAt(part.start)],
				},
			})
		}
	}

	return codeLens
}



/** Provide referenced class name CodeLens service. */
async function getReferencedCodeLens(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<CodeLens[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let codeLens: CodeLens[] = []

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		let classNameParts = currentHTMLService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return codeLens
		}

		if (configuration.enableGlobalEmbeddedCSS) {
			await htmlServiceMap.beFresh()
		}

		for (let part of classNameParts) {

			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			let classNames = part.formatted
			let count = 0

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)

				if (configuration.enableGlobalEmbeddedCSS) {
					count += htmlServiceMap.getReferencedClassNameCount(nonIdentifierClassName)
				}
				else {
					count += currentHTMLService.getReferencedClassNameCount(nonIdentifierClassName)
				}
			}

			if (count > 0) {
				codeLens.push({
					range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
					command: {
						title: count > 1 ? `${count} references` : `${count} reference`,
						command: `CSSNavigation.peekReferences`,
						arguments: [document.uri, document.positionAt(part.start)],
					},
				})
			}
		}

		return codeLens
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		let classNameParts = currentCSSService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return codeLens
		}

		await htmlServiceMap.beFresh()

		for (let part of classNameParts) {
			
			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			let classNames = part.formatted
			let count = 0

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)

				// Any one of formatted exist, break.
				count += htmlServiceMap.getReferencedClassNameCount(nonIdentifierClassName)
			}

			if (count > 0) {
				codeLens.push({
					range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
					command: {
						title: count > 1 ? `${count} references` : `${count} reference`,
						command: `CSSNavigation.peekReferences`,
						arguments: [document.uri, document.positionAt(part.start)],
					},
				})
			}
		}

		return codeLens
	}

	return null
}
