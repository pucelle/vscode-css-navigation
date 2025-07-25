import {TextDocument} from 'vscode-languageserver-textdocument'
import {CompletionLabels, CompletionLabelType, CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, Part, PartConvertor, PartType} from './languages'
import {CompletionItem} from 'vscode-languageserver'
import {getPathExtension} from './utils'


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
		if (!currentHTMLService) {
			return null
		}

		let fromPart = currentHTMLService.findDetailedPartAt(offset)
		if (!fromPart) {
			return null
		}

		return await getCompletionItemsInHTML(fromPart, currentHTMLService, document, cssServiceMap, configuration, offset)
	}
	else if (isCSSFile) {
		let currentCSSService = await cssServiceMap.forceGetServiceByDocument(document)
		if (!currentCSSService) {
			return null
		}

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
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
	offset: number
): Promise<CompletionItem[] | null> {


	// `#i` -> `i` to do completion is not working.
	let matchPart = PartConvertor.toDefinitionMode(fromPart)
	let labels = new CompletionLabels()

	// Complete html element class name.
	if (fromPart.isHTMLType()) {
		labels.add(CompletionLabelType.Definition, currentService.getCompletionLabels(matchPart, fromPart, configuration.maxHoverStylePropertyCount))
		labels.add(CompletionLabelType.Definition, await cssServiceMap.getCompletionLabels(matchPart, fromPart, configuration.maxHoverStylePropertyCount))
	}

	// Complete class name for css selector of a css document.
	// It's a little different with css document, don't want it visits all html files.
	else if (fromPart.isCSSType()) {
		labels.add(CompletionLabelType.CSSVariable, currentService.getReferencedCompletionLabels(fromPart))

		// Find all css variable declarations across all css documents.
		if (fromPart.isCSSVariableType()) {
			labels.add(CompletionLabelType.CSSVariable, await cssServiceMap.getCompletionLabels(matchPart, fromPart, configuration.maxHoverStylePropertyCount))
		}
	}

	let forceEditCollapseToOffset = fromPart.type === PartType.ClassPotential ? offset : undefined
	return labels.output(fromPart, document, forceEditCollapseToOffset)
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
		labels.add(CompletionLabelType.CSSVariable,
			await cssServiceMap.getCompletionLabels(matchPart, fromPart, configuration.maxHoverStylePropertyCount)
		)

		// Remove repetitive items with current document.
		if (configuration.disableOwnCSSVariableCompletion) {
			let currentLabels = currentService.getReferencedCompletionLabels(fromPart)
			labels.remove(currentLabels.keys())
		}
	}


	return labels.output(fromPart, document)
}
