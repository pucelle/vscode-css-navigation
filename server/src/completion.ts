import {TextDocument} from 'vscode-languageserver-textdocument'
import {CompletionLabels, CompletionLabelType, CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor} from './languages'
import {CompletionItem} from 'vscode-languageserver'
import {getPathExtension} from './helpers'


/** Provide auto completion service for HTML or CSS document. */
export async function getCompletionItems(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<CompletionItem[] | null> {
	let documentExtension = getPathExtension(document.uri)
	let isHTMLFile = configuration.activeHTMLFileExtensions.includes(documentExtension)
	let isCSSFile = configuration.activeCSSFileExtensions.includes(documentExtension)

	if (isHTMLFile) {
		let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await getCompletionItemsInHTML(fromPart, currentHTMLService, document, cssServiceMap)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await getCompletionItemsInCSS(fromPart, currentCSSService, document, htmlServiceMap, cssServiceMap, configuration)
	}

	return null
}


/** Provide completion for HTML document. */
async function getCompletionItemsInHTML(
	fromPart: Part,
	currentService: HTMLService,
	document: TextDocument,
	cssServiceMap: CSSServiceMap
): Promise<CompletionItem[] | null> {


	// `#i` -> `i` to do completion is not working.
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let labels = new CompletionLabels()

	// Complete html element class name.
	if (fromPart.isHTMLType()) {
		labels.add(CompletionLabelType.Definition, currentService.getCompletionLabels(matchPart, fromPart))
		labels.add(CompletionLabelType.Definition, await cssServiceMap.getCompletionLabels(matchPart, fromPart))
	}

	// Complete class name for css selector of a css document.
	// It's a little different with css document, don't want it visits all html files.
	else if (fromPart.isCSSType()) {
		labels.add(CompletionLabelType.CSSVariable, currentService.getReferencedCompletionLabels(fromPart))

		// Find all css variable declarations across all css documents.
		if (fromPart.isCSSVariableType()) {
			labels.add(CompletionLabelType.CSSVariable, await cssServiceMap.getCompletionLabels(matchPart, fromPart))
		}
	}

	return labels.output(fromPart, document)
}


/** Provide completion for CSS document. */
async function getCompletionItemsInCSS(
	fromPart: Part,
	currentService: HTMLService | CSSService,
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration
): Promise<CompletionItem[] | null> {
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let labels = new CompletionLabels()


	// Find selector referenced completions from current document, and across all html documents.
	// It ignores css selectors declaration completions, which will be filled by vscode.
	if (fromPart.isSelectorType()) {
		labels.add(CompletionLabelType.Reference, await htmlServiceMap.getReferencedCompletionLabels(fromPart))
	}

	// Find all css variable declarations across all css documents.
	else if (fromPart.isCSSVariableType()) {
		labels.add(CompletionLabelType.CSSVariable, await cssServiceMap.getCompletionLabels(matchPart, fromPart))

		// Remove repetitive items with current document.
		if (configuration.disableOwnCSSVariableCompletion) {
			let currentLabels = currentService.getReferencedCompletionLabels(fromPart)
			labels.remove(currentLabels.keys())
		}
	}


	return labels.output(fromPart, document)
}
