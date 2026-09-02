import {Diagnostic, DiagnosticSeverity} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSServiceMap, HTMLServiceMap, PartType} from './languages'
import {getPathExtension} from './utils'
import {CSSSelectorDetailedPart} from './languages/parts/part-css-selector-detailed'


export interface ClassNameDiagnosticData {
	className: string
}


/** Declare diagnostic fixes. */
export const ClassNameDiagnosticCode = {
	DefinitionNotFound: 'css-navigation.class-definition-not-found',
	ReferenceNotFound: 'css-navigation.class-reference-not-found',
} as const


/** Make a matcher for class names excluded from diagnostics. */
export function makeDiagnosticIgnoredClassNameMatcher(patterns: readonly string[]): (className: string) => boolean {
	const regularExpressions = patterns
		.map(pattern => pattern.trim().replace(/^\./, ''))
		.filter(Boolean)
		.map(pattern => new RegExp(
			'^' + pattern
				.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
				.replace(/\*/g, '.*')
			+ '$'
		))

	return className => regularExpressions.some(pattern => pattern.test(className.replace(/^\./, '')))
}


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
	const isIgnored = makeDiagnosticIgnoredClassNameMatcher(configuration.diagnosticIgnoredClassNames ?? [])

	if (shouldProvideDefDiag) {
		const diags = await getDefinitionDiagnostics(document, htmlServiceMap, cssServiceMap, configuration, isIgnored)
		if (diags) {
			diagnostics.push(...diags)
		}
	}

	if (shouldProvideRefDiag) {
		const diags = await getReferencedDiagnostics(document, htmlServiceMap, cssServiceMap, configuration, isIgnored)
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
	configuration: Configuration,
	isIgnored: (className: string) => boolean
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
		if (isIgnored(className)) {
			continue
		}

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
			code: ClassNameDiagnosticCode.DefinitionNotFound,
			data: {className} satisfies ClassNameDiagnosticData,
		})
	}

	return diagnostics
}



/** Provide referenced class name diagnostics service. */
async function getReferencedDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
	isIgnored: (className: string) => boolean
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
				if (isIgnored(nonIdentifierClassName)) {
					break
				}

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
					code: ClassNameDiagnosticCode.ReferenceNotFound,
					data: {className: nonIdentifierClassName} satisfies ClassNameDiagnosticData,
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
				if (isIgnored(nonIdentifierClassName)) {
					break
				}

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
					code: ClassNameDiagnosticCode.ReferenceNotFound,
					data: {className: nonIdentifierClassName} satisfies ClassNameDiagnosticData,
				})
				break
			}
		}

		return diagnostics
	}

	return null
}
