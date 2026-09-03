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
	let fullMatchNames = new Set<string>()
	let wildcardPatterns: RegExp[] = []

	for (let configuredName of patterns) {
		let name = configuredName.trim().replace(/^\./, '')
		if (!name) {
			continue
		}

		if (name.includes('*')) {
			wildcardPatterns.push(new RegExp(
				'^' + name
					.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
					.replace(/\*/g, '.*')
				+ '$'
			))
		}
		else {
			fullMatchNames.add(name)
		}
	}

	return className => {
		return fullMatchNames.has(className)
			|| wildcardPatterns.some(pattern => pattern.test(className))
	}
}


/** Get updated after configuration changed. */
let isDiagnosticIgnoredClassName = makeDiagnosticIgnoredClassNameMatcher([])

/** Rebuild the shared matcher after its configuration changes. */
export function updateDiagnosticIgnoredClassNameMatcher(patterns: readonly string[]) {
	isDiagnosticIgnoredClassName = makeDiagnosticIgnoredClassNameMatcher(patterns)
}


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


/** Provide defined class name diagnostics service. */
async function getDefinitionDiagnostics(
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<Diagnostic[] | null> {
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

	if (configuration.enableGlobalEmbeddedCSS) {
		await htmlServiceMap.beFresh()
	}

	for (let part of classNameParts) {

		// Without identifier.
		let className = part.escapedText
		if (isDiagnosticIgnoredClassName(className)) {
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

		if (configuration.enableGlobalEmbeddedCSS) {
			await htmlServiceMap.beFresh()
		}

		for (let part of classNameParts) {

			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			let classNames = part.formatted

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)
				if (isDiagnosticIgnoredClassName(nonIdentifierClassName)) {
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
				let wrapper = part.getWrapper(currentHTMLService)
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

			// Totally reference parent, no need to diagnose.
			if (part.escapedText === '&') {
				continue
			}

			let classNames = part.formatted

			for (let className of classNames) {

				// Without identifier.
				let nonIdentifierClassName = className.slice(1)
				if (isDiagnosticIgnoredClassName(nonIdentifierClassName)) {
					break
				}

				// Any one of formatted exist, break.
				if (htmlServiceMap.hasReferencedClassName(nonIdentifierClassName)) {
					break
				}

				// Has `@css-ignore` comment.
				let wrapper = part.getWrapper(currentCSSService)
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
