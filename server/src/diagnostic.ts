import {Diagnostic, DiagnosticSeverity} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSServiceMap, HTMLServiceMap, PartType} from './languages'
import {getPathExtension} from './utils'
import {CSSSelectorDetailedPart} from './languages/parts/part-css-selector-detailed'


/** Provide class name diagnostics service. */
export async function getDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Diagnostic[] | null> {
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	const shouldProvideDefDiag = isHTMLFile && configuration.enableClassNameDefinitionDiagnostic
	const shouldProvideRefDiag = (isHTMLFile || isCSSFile) && configuration.enableClassNameReferenceDiagnostic

	if (!shouldProvideDefDiag && !shouldProvideRefDiag) {
		return null
	}

	const diagnostics: Diagnostic[] = []

	if (shouldProvideDefDiag) {
		const diags = await getDefinitionDiagnostics(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			diagnostics.push(...diags)
		}
	}

	if (shouldProvideRefDiag) {
		const diags = await getReferencedDiagnostics(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			diagnostics.push(...diags)
		}
	}

	return diagnostics
}


/** Provide defined class name diagnostics service. */
async function getDefinitionDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Diagnostic[] | null> {
	const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
	if (!currentHTMLService) {
		return null
	}

	const diagnostics: Diagnostic[] = []

	const classNameParts = currentHTMLService.getPartsByType(PartType.Class)
	if (!classNameParts || classNameParts.length === 0) {
		return diagnostics
	}

	await cssServiceMap.beFresh()

	if (configuration.enableGlobalEmbeddedCSS) {
		await htmlServiceMap.beFresh()
	}

	for (const part of classNameParts) {

		// Without identifier.
		const className = part.escapedText

		if (currentHTMLService.hasDefinedClassName(className)) {
			continue
		}

		if (cssServiceMap.hasDefinedClassName(className)) {
			continue
		}

		if (configuration.enableGlobalEmbeddedCSS) {
			if (htmlServiceMap.hasDefinedClassName(className)) {
				continue
			}
		}

		diagnostics.push({
			severity: DiagnosticSeverity.Warning,
            range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
            message: `Can't find definition for ".${className}".`,
            source: 'CSS Navigation',
		})
	}

	return diagnostics
}



/** Provide referenced class name diagnostics service. */
async function getReferencedDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Diagnostic[] | null> {
	const documentExtension = getPathExtension(document.uri)
	const isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	const isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	const diagnostics: Diagnostic[] = []

	if (isHTMLFile) {
		const currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		const classNameParts = currentHTMLService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return diagnostics
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

			for (const className of classNames) {

				// Without identifier.
				const nonIdentifierClassName = className.slice(1)

				// Find only within current document.
				// Any one of formatted exist, break.
				if (currentHTMLService.hasReferencedClassName(nonIdentifierClassName)) {
					break
				}

				// Query across all js files.
				if (configuration.enableGlobalEmbeddedCSS) {
					if (htmlServiceMap.hasReferencedClassName(nonIdentifierClassName)) {
						break
					}
				}

				// Has `@css-ignore` comment.
				const wrapper = part.getWrapper(currentHTMLService)
				if (wrapper && wrapper.comment?.includes('@css-ignore')) {
					break
				}

				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
					message: `Can't find reference for "${className}".`,
					source: 'CSS Navigation',
				})
				break
			}
		}

		return diagnostics
	}
	else if (isCSSFile) {
		const currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		const classNameParts = currentCSSService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return diagnostics
		}

		await htmlServiceMap.beFresh()

		for (const part of classNameParts) {

			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			const classNames = part.formatted

			for (const className of classNames) {

				// Without identifier.
				const nonIdentifierClassName = className.slice(1)

				// Any one of formatted exist, break.
				if (htmlServiceMap.hasReferencedClassName(nonIdentifierClassName)) {
					break
				}

				// Has `@css-ignore` comment.
				const wrapper = part.getWrapper(currentCSSService)
				if (wrapper && wrapper.comment?.includes('@css-ignore')) {
					break
				}

				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
					message: `Can't find reference for "${className}".`,
					source: 'CSS Navigation',
				})
				break
			}
		}

		return diagnostics
	}

	return null
}
