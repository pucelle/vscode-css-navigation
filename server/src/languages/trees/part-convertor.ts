import {CompletionItem, CompletionItemKind, Hover, Location, LocationLink, MarkupKind, Range, SymbolInformation, SymbolKind, TextEdit} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {escapeAsRegExpSource} from './utils'
import {Part, PartType} from './part'
import {CSSSelectorPart} from './part-css-selector'


/** Help to convert part type and text. */
export namespace PartConvertor {

	/** Get css part type from text which includes identifiers like `.`, `#`. */
	export function getCSSSelectorTypeByText(text: string): PartType {
		if (text[0] === '#') {
			return PartType.CSSSelectorId
		}
		else if (text[0] === '.') {
			return PartType.CSSSelectorClass
		}
		else {
			return PartType.Tag
		}
	}


	/** `ab` -> /\bab/i. */
	export function makeWordStartsMatchExp(text: string): RegExp {
		if (/^[a-z]/i.test(text)) {
			return new RegExp('\\b' + escapeAsRegExpSource(text), 'i')
		}
		else {
			return new RegExp(escapeAsRegExpSource(text), 'i')
		}
	}


	/** `ab` -> /^ab/i. */
	export function makeStartsMatchExp(text: string): RegExp {
		return new RegExp('^' + escapeAsRegExpSource(text), 'i')
	}


	/** `ab` -> /^\.?ab/i. */
	export function makeMayIdentifierStartsMatchExp(text: string, type: PartType): RegExp {
		if (type === PartType.Id
			|| type === PartType.CSSSelectorId
			|| type === PartType.CSSSelectorQueryId
		) {
			// Removes `#`
			text = textToType(text, type, PartType.Id)

			return new RegExp('^\\#?' + escapeAsRegExpSource(text), 'i')
		}
		else if (type === PartType.Class
			|| type === PartType.CSSSelectorClass
			|| type === PartType.CSSSelectorQueryClass
		) {
			// Removes `.`
			text = textToType(text, type, PartType.Class)

			return new RegExp('^\\.?' + escapeAsRegExpSource(text), 'i')
		}
		else {
			return new RegExp('^' + escapeAsRegExpSource(text), 'i')
		}
	}

	
	/** Convert text to from specified part type, to target part type. */
	export function textToType(text: string, fromType: PartType, toType: PartType): string {
		if (fromType === toType) {
			return text
		}

		if (fromType === PartType.Id) {
			if (toType === PartType.CSSSelectorId || toType === PartType.CSSSelectorQueryId) {
				text = '#' + text
			}
		}
		else if (fromType === PartType.CSSSelectorId || fromType === PartType.CSSSelectorQueryId) {
			if (toType === PartType.Id) {
				text = text.slice(1)
			}
		}

		else if (fromType === PartType.Class
			|| fromType === PartType.ReactDefaultImportedCSSModuleClass
			|| fromType === PartType.ReactImportedCSSModuleProperty
		) {
			if (toType === PartType.CSSSelectorQueryClass || toType === PartType.CSSSelectorClass) {
				text = '.' + text
			}
		}

		else if (fromType === PartType.CSSSelectorQueryClass
			|| fromType === PartType.CSSSelectorClass
		) {
			if (toType === PartType.Class
				|| toType === PartType.ReactDefaultImportedCSSModuleClass
				|| toType === PartType.ReactImportedCSSModuleProperty
			) {
				text = text.slice(1)
			}
		}

		return text
	}


	/** Convert type to definition part type. */
	export function typeToDefinition(type: PartType): PartType {
		if (type === PartType.Tag) {
			return PartType.CSSSelectorTag
		}
		else if (type === PartType.Id) {
			return PartType.CSSSelectorId
		}
		else if (type === PartType.Class) {
			return PartType.CSSSelectorClass
		}
		else if (type === PartType.CSSSelectorQueryTag) {
			return PartType.CSSSelectorTag
		}
		else if (type === PartType.CSSSelectorQueryId) {
			return PartType.CSSSelectorId
		}
		else if (type === PartType.CSSSelectorQueryClass) {
			return PartType.CSSSelectorClass
		}
		else if (type === PartType.CSSVariableAssignment || type === PartType.CSSVariableReference) {
			return PartType.CSSVariableDeclaration
		}
		else if (type === PartType.ReactDefaultImportedCSSModuleClass
			|| type === PartType.ReactImportedCSSModuleProperty
		) {
			return PartType.CSSSelectorClass
		}

		return type
	}



	/** Get a range from its related document. */
	export function toRange(part: Part, document: TextDocument): Range {
		return Range.create(document.positionAt(part.start), document.positionAt(part.end))
	}

	/** To a location link for going to definition. */
	export function toLocationLink(part: Part, document: TextDocument, fromPart: Part, fromDocument: TextDocument) {
		let selectionRange = toRange(part, document)
		let end = part.defEnd > -1 ? part.defEnd : part.end

		// Selection range doesn't work as expected, finally cursor move to definition start.
		let definitionRange = Range.create(selectionRange.start, document.positionAt(end))

		let fromRange = toRange(fromPart, fromDocument)

		return LocationLink.create(document.uri, definitionRange, selectionRange, fromRange)
	}

	/** To a location link for going to definition. */
	export function mayPrimaryToLocationLink(part: Part, document: TextDocument, fromPart: Part, fromDocument: TextDocument) {
		if (part.type === PartType.CSSSelector && (part as CSSSelectorPart).primary) {
			return toLocationLink((part as CSSSelectorPart).primary!, document, fromPart, fromDocument)
		}
		else {
			return toLocationLink(part, document, fromPart, fromDocument)
		}
	}

	/** To a location for finding references. */
	export function toLocation(part: Part, document: TextDocument) {
		return Location.create(document.uri, toRange(part, document))
	}

	/** To several symbol information for workspace symbol searching. */
	export function toSymbolInformationList(part: Part, document: TextDocument): SymbolInformation[] {
		let kind = part.type === PartType.CSSSelector
			|| part.type === PartType.CSSSelectorTag
			|| part.type === PartType.CSSSelectorClass
			|| part.type === PartType.CSSSelectorId
				? SymbolKind.Class
				: SymbolKind.Variable

		return part.textList.map(text => SymbolInformation.create(
			text,
			kind,
			toRange(part, document),
			document.uri
		))
	}

	/** To completion item list. */
	export function toCompletionItems(fromPart: Part, labels: string[], document: TextDocument): CompletionItem[] {
		let kind = fromPart.type === PartType.CSSSelector
			|| fromPart.type === PartType.CSSSelectorTag
			|| fromPart.type === PartType.CSSSelectorClass
			|| fromPart.type === PartType.CSSSelectorId
			|| fromPart.type === PartType.CSSSelectorQueryTag
			|| fromPart.type === PartType.CSSSelectorQueryClass
			|| fromPart.type === PartType.CSSSelectorQueryId
			|| fromPart.type === PartType.Tag
			|| fromPart.type === PartType.Class
			|| fromPart.type === PartType.Id
				? CompletionItemKind.Class
				: CompletionItemKind.Color

		return labels.map(text => {
			let item = CompletionItem.create(text)
			item.kind = kind
			item.sortText = '-1'
	
			item.textEdit = TextEdit.replace(
				toRange(fromPart, document),
				text,
			)

			return item
		})
	}

	/** To hover. */
	export function toHover(part: Part, comment: string | undefined, document: TextDocument): Hover {
		let cssPart = part.toDefinitionMode()
		let content = '```css\n' + cssPart.text + '\n```'

		if (comment) {
			content += '\n' + comment.trim()
		}

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: content,
			},
			range: toRange(part, document)
		}
	}
}
