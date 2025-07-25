import {Color as VSColor, ColorInformation, Hover, Location, LocationLink, MarkupKind, Range, SymbolInformation, SymbolKind} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {escapeAsRegExpSource} from '../trees/utils'
import {Part, PartType} from './part'
import {CSSSelectorWrapperPart} from './part-css-selector-wrapper'
import {CSSTokenTree} from '../trees/css-tree'
import {CSSTokenNodeType} from '../trees/css-node'
import {PartComparer} from './part-comparer'
import {Color} from '../../utils'
import {CSSVariableDefinitionPart} from './part-css-variable-definition'


/** Help to convert part type and text. */
export namespace PartConvertor {

	/** Get css part type from text which includes identifiers like `.`, `#`. */
	export function getCSSSelectorDetailedTypeByText(text: string): PartType {
		if (text[0] === '#') {
			return PartType.CSSSelectorId
		}
		else if (text[0] === '.') {
			return PartType.CSSSelectorClass
		}
		else {
			return PartType.CSSSelectorTag
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
	export function makeIdentifiedStartsMatchExp(texts: string[], type: PartType): RegExp {
		if (type === PartType.Id
			|| type === PartType.CSSSelectorId
			|| type === PartType.CSSSelectorQueryId
		) {
			// Removes `#`
			texts = texts.map(text => textToType(text, type, PartType.Id))

			return new RegExp('^\\#?(?:' + texts.map(text => escapeAsRegExpSource(text)).join('|') + ')', 'i')
		}
		else if (type === PartType.Class
			|| type === PartType.CSSSelectorClass
			|| type === PartType.CSSSelectorQueryClass
		) {
			// Removes `.`
			texts = texts.map(text => textToType(text, type, PartType.Class))

			return new RegExp('^\\.?(?:' + texts.map(text => escapeAsRegExpSource(text)).join('|') + ')', 'i')
		}
		else {
			return new RegExp('^(?:' + texts.map(text => escapeAsRegExpSource(text)).join('|') + ')', 'i')
		}
	}

	
	/** Convert text from specified part type, to target part type. */
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

		else if (fromType === PartType.ClassPotential) {
			text = ''
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
		else if (type === PartType.Class || type === PartType.ClassPotential) {
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
		else if (type === PartType.CSSVariableAssignment
			|| type === PartType.CSSVariableReference
			|| type === PartType.CSSVariableReferenceNoVar
			|| type === PartType.CSSVariableDefinitionNotComplete
		) {
			return PartType.CSSVariableDefinition
		}
		else if (type === PartType.ReactDefaultImportedCSSModuleClass
			|| type === PartType.ReactImportedCSSModuleProperty
		) {
			return PartType.CSSSelectorClass
		}

		return type
	}

		
	/** 
	 * Transform a part to definition type, normally use it for definition matching.
	 * This is only one definition type mapped to several reference types,
	 * so can transform to definition mode to make comparing faster.
	 */
	export function toDefinitionMode(part: Part): Part {
		let type = PartConvertor.typeToDefinition(part.type)
		let text = PartConvertor.textToType(part.text, part.type, type)

		return new Part(type, text, -1, -1)
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

	/** To a location for finding references. */
	export function toLocation(part: Part, document: TextDocument) {
		return Location.create(document.uri, toRange(part, document))
	}

	/** To several symbol information for workspace symbol searching. */
	export function toSymbolInformationList(part: Part, document: TextDocument): SymbolInformation[] {
		let kind = part.type === PartType.CSSSelectorWrapper
			|| part.type === PartType.CSSSelectorTag
			|| part.type === PartType.CSSSelectorClass
			|| part.type === PartType.CSSSelectorId
				? SymbolKind.Class
				: SymbolKind.Variable

		let textList = PartComparer.mayFormatted(part)

		return textList.map(text => SymbolInformation.create(
			text,
			kind,
			toRange(part, document),
			document.uri
		))
	}

	/** Selector part to hover. */
	export function toHoverOfSelectorWrapper(part: CSSSelectorWrapperPart, fromPart: Part, document: TextDocument, fromDocument: TextDocument, maxStylePropertyCount: number): Hover {
		let content = getSelectorStyleContent(part, document, maxStylePropertyCount)
		let comment = part.comment?.trim()

		if (comment) {
			content = comment + '\n' + content
		}

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: content,
			},
			range: toRange(fromPart, fromDocument),
		}
	}

	/** Get selector style content by selector part. */
	export function getSelectorStyleContent(part: CSSSelectorWrapperPart, document: TextDocument, maxStylePropertyCount: number): string {
		
		let content = '```css\n' + PartComparer.mayFormatted(part)[0] + ' {'

		if (maxStylePropertyCount > 0) {
			content += parseStyleProperties(part, document.getText(), maxStylePropertyCount)
		}
		else {
			content += '...'
		}

		content += '}\n```'

		return content
	}

	function parseStyleProperties(part: CSSSelectorWrapperPart, string: string, maxStylePropertyCount: number): string {
		let text = string.slice(part.start, part.defEnd)
		let tree = CSSTokenTree.fromString(text, 0, 'css')
		let content = ''
		let count = 0
		let hasAdditional = false
		let selectorNode = tree.children!.find(child => child.type === CSSTokenNodeType.Selector)

		if (!selectorNode) {
			return '...'
		}

		for (let child of selectorNode.children!) {
			if (count === maxStylePropertyCount) {
				hasAdditional = true
				break
			}

			if (child.type === CSSTokenNodeType.PropertyName) {
				content += '\n\t' + child.token.text.trim()
			}

			else if (child.type === CSSTokenNodeType.PropertyValue) {
				content += ': ' + child.token.text.trim() + ';'
				count++
			}

			else {
				hasAdditional = true
				break
			}
		}

		if (hasAdditional) {
			if (count > 0) {
				content += '\n\t...\n'
			}
			else {
				content += '...'
			}
		}
		else {
			content += '\n'
		}

		return content
	}

	/** CSS Variable definition part to hover. */
	export function toHoverOfCSSVariableDefinition(part: CSSVariableDefinitionPart, fromPart: Part, fromDocument: TextDocument): Hover | null {
		let comment = part.comment?.trim()
		let value = part.value?.trim()
		let content = ''

		if (value) {
			content += 'Value: ' + value
		}

		if (comment) {
			content += '\n\n' + comment
		}

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: content,
			},
			range: toRange(fromPart, fromDocument),
		}
	}


	/** CSS Variable part to color information. */
	export function toColorInformation(part: Part, value: string, fromDocument: TextDocument): ColorInformation | null {
		let color = Color.fromString(value)
		if (!color) {
			return null
		}

		return {
			color: VSColor.create(color.r, color.g, color.b, color.a),
			range: toRange(part, fromDocument),
		}
	}
}
