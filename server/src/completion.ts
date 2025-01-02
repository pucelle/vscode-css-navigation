import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartType} from './languages'
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

		let fromPart = currentHTMLService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await getCompletionItemsInHTML(fromPart, currentHTMLService, document, htmlServiceMap, cssServiceMap, configuration)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

		let fromPart = currentCSSService.findPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await getCompletionItemsInCSS(fromPart, currentCSSService, document, htmlServiceMap, cssServiceMap)
	}

	return null
}


/** Provide completion for HTML document. */
async function getCompletionItemsInHTML(
	fromPart: Part,
	currentService: HTMLService,
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
): Promise<CompletionItem[] | null> {

	// If custom tag, and not ignore custom element, continue.
	if (fromPart.type === PartType.Tag) {
		if (configuration.ignoreCustomElement || !fromPart.text.includes('-')) {
			return null
		}
	}


	// `#i` -> `i` to do completion is not working.
	let matchPart = fromPart.toDefinitionMode()
	let items: CompletionItem[] = []

	// Complete html element class name.
	if (fromPart.isHTMLType()) {
		items.push(...currentService.getCompletionItems(matchPart, fromPart, document))
		items.push(...await cssServiceMap.getCompletionItems(matchPart, fromPart, document))
	}

	// Complete class name for css selector of a css document.
	else if (fromPart.isCSSType()) {
		items.push(...await htmlServiceMap.getReferencedCompletionItems(fromPart, document))

		// Declare or reference a CSS Variable.
		if (fromPart.isCSSVariableType()) {
			items.push(...await cssServiceMap.getCompletionItems(matchPart, fromPart, document))
		}
	}

	return items
}


/** Provide completion for CSS document. */
async function getCompletionItemsInCSS(
	fromPart: Part,
	_currentService: HTMLService | CSSService,
	document: TextDocument,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap
): Promise<CompletionItem[] | null> {
	let matchPart = fromPart.toDefinitionMode()
	let items: CompletionItem[] = []


	// Find selector referenced completions across all html documents.
	if (fromPart.isSelectorType()) {
		items.push(...await htmlServiceMap.getReferencedCompletionItems(fromPart, document))
	}

	// Find CSS Variables across all css documents.
	else if (fromPart.isCSSVariableType()) {
		items.push(...await cssServiceMap.getCompletionItems(matchPart, fromPart, document))
	}


	return items
}
