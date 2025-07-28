import {Diagnostic, DiagnosticSeverity} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSServiceMap, HTMLServiceMap, PartType} from './languages'
import {getPathExtension} from './utils'


/** Provide class name diagnostics service. */
export async function getDiagnostics(
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

	for (let part of currentHTMLService.getPartsByType(PartType.Class)) {

		// With identifier.
		let className = '.' + part.text

		if (currentHTMLService.hasClassName(className)) {
			continue
		}
		
		if (await cssServiceMap.hasClassName(className)) {
			continue
		}

		diagnostics.push({
			severity: DiagnosticSeverity.Warning,
            range: {start: document.positionAt(part.start), end: document.positionAt(part.end)},
            message: `Can't find definition for class name "${className}".`,
            source: 'CSS Navigation',
		})
	}

	return diagnostics
}
