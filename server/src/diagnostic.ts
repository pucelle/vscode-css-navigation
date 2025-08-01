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
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let shouldProvideDefDiag = isHTMLFile && configuration.enableClassNameDefinitionDiagnostic
	let shouldProvideRefDiag = (isHTMLFile || isCSSFile) && configuration.enableClassNameReferenceDiagnostic

	if (!shouldProvideDefDiag && !shouldProvideRefDiag) {
		return null
	}

	let diagnostics: Diagnostic[] = []

	if (shouldProvideDefDiag) {
		let diags = await getDefinitionDiagnostics(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			diagnostics.push(...diags)
		}
	}

	if (shouldProvideRefDiag) {
		let diags = await getReferencedDiagnostics(document, htmlServiceMap, cssServiceMap, configuration)
		if (diags) {
			diagnostics.push(...diags)
		}
	}

	return diagnostics
}


/** Provide class name diagnostics service. */
async function getDefinitionDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Diagnostic[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)

	if (!isHTMLFile) {
		return null
	}

	let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
	if (!currentHTMLService) {
		return null
	}

	let diagnostics: Diagnostic[] = []

	let classNameParts = currentHTMLService.getPartsByType(PartType.Class)
	if (!classNameParts || classNameParts.length === 0) {
		return diagnostics
	}

	await cssServiceMap.beFresh()

	if (configuration.enableSharedCSSFragments && isHTMLFile) {
		await htmlServiceMap.beFresh()
	}

	for (let part of classNameParts) {

		// Without identifier.
		let className = part.text

		if (currentHTMLService.hasDefinedClassName(className)) {
			continue
		}

		if (cssServiceMap.hasDefinedClassName(className)) {
			continue
		}

		if (configuration.enableSharedCSSFragments && isHTMLFile) {
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
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)
	let diagnostics: Diagnostic[] = []

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)
		if (!currentHTMLService) {
			return null
		}

		let classNameParts = currentHTMLService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return diagnostics
		}

		if (configuration.enableSharedCSSFragments) {
			await htmlServiceMap.beFresh()
		}

		for (let part of classNameParts) {

			// Totally reference parent, no need to diagnose.
			if (part.text === '&') {
				continue
			}

			let classNames = part.formatted

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)

				// Find only within current document.
				// Any one of formatted exist, break.
				if (currentHTMLService.hasReferencedClassName(nonIdentifierClassName)) {
					break
				}

				if (configuration.enableSharedCSSFragments) {
					if (htmlServiceMap.hasReferencedClassName(nonIdentifierClassName)) {
						break
					}
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
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

		let classNameParts = currentCSSService.getPartsByType(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (!classNameParts || classNameParts.length === 0) {
			return diagnostics
		}

		await htmlServiceMap.beFresh()

		for (let part of classNameParts) {
			let classNames = part.formatted

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)

				// Any one of formatted exist, break.
				if (htmlServiceMap.hasReferencedClassName(nonIdentifierClassName)) {
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
