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

	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	const codeLens: CodeLens[] = []

	if (isHTMLFile && configuration.enableDefinitionCodeLens) {
		const diags = await getDefinitionCodeLens(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			codeLens.push(...diags)
		}
	}

	if ((isHTMLFile || isCSSFile) && configuration.enableReferenceCodeLens) {
		const diags = await getReferencedCodeLens(document, htmlServiceMap, cssServiceMap, configuration)
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
	const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
	if (!currentHTMLService) {
		return null
	}

	const codeLens: CodeLens[] = []

	const classNameParts = [
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

	for (const part of classNameParts) {

		// Without identifier.
		const className = part.escapedText
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
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	const codeLens: CodeLens[] = []

	if (isHTMLFile) {
		const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		const classNameParts = currentHTMLService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return codeLens
		}

		if (configuration.enableGlobalEmbeddedCSS) {
			await htmlServiceMap.beFresh()
		}

		for (const part of classNameParts) {

			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			const classNames = part.formatted
			let count = 0

			for (const className of classNames) {

				// Without identifier.
				const nonIdentifierClassName = className.slice(1)

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
		const currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		const classNameParts = currentCSSService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return codeLens
		}

		await htmlServiceMap.beFresh()

		for (const part of classNameParts) {
			
			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			const classNames = part.formatted
			let count = 0

			for (const className of classNames) {

				// Without identifier.
				const nonIdentifierClassName = className.slice(1)

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
