import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSServiceMap, HTMLServiceMap} from './languages'
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
		return await getCompletionItemsInHTML(document, offset, htmlServiceMap, cssServiceMap)
	}
	else if (isCSSFile) {
		return await getCompletionItemsInCSS(document, offset, htmlServiceMap, cssServiceMap)
	}

	return null
}

/** Provide completion for HTML document. */
async function getCompletionItemsInHTML(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap
): Promise<CompletionItem[] | null> {
	let currentHTMLService = await htmlServiceMap.forceGetServiceByDocument(document)

	let fromPart = currentHTMLService.findPartAt(offset)
	if (!fromPart) {
		return null
	}


	let matchPart = fromPart.toDefinitionMode()
	let items: CompletionItem[] = []

	// Complete html element class name.
	if (fromPart.isHTMLType()) {
		items.push(...currentHTMLService.getCompletionItems(matchPart, fromPart, document))
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
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap
): Promise<CompletionItem[] | null> {
	let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)

	let fromPart = currentCSSService.findPartAt(offset)
	if (!fromPart) {
		return null
	}

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
