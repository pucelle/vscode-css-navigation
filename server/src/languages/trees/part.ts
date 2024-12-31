import {CompletionItem, CompletionItemKind, Hover, Location, LocationLink, MarkupKind, Range, SymbolInformation, SymbolKind, TextEdit} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {escapeAsRegExpSource, hasQuotes} from './utils'


/** Part types. */
export enum PartType {

	//// Common

	/** 
	 * `<link href=...>`
	 * `<script src=...>`
	 * `@import ...`
	 * Import 'file.css'
	 * Import name from 'file.css'
	 * Contains only path.
	 */
	CSSImportPath,


	//// From HTML.

	Tag,

	/** It doesn't include identifier `#`. */
	Id,

	/** It doesn't include identifier `.`. */
	Class,

	/**
	 * `querySelector('div')`
	 * `$('div')`
	 */
	CSSSelectorQueryTag,

	/**
	 * `querySelector('#id')`
	 * `$('#id')`
	 */
	CSSSelectorQueryId,

	/**
	 * `querySelector('.class-name')`
	 * `$('.class-name')`
	 */
	CSSSelectorQueryClass,

	/** `style.setProperty('--variable-name', ...)` */
	CSSVariableAssignment,

	/**
	 * `import style from 'xxx.css'`
	 * `class={style.className}`
	 * `class={style['class-name']}`
	*/
	ReactImportedCSSModuleName,
	ReactImportedCSSModuleProperty,

	/**
	 * `import 'xxx.css'`
	 * `styleName="class-name"`
	*/
	ReactDefaultImportedCSSModule,


	//// From CSS.

	/** Any selector string like `#id`, `.class-name`. */
	CSSSelector,

	CSSSelectorMainTag,

	/** It includes identifier `#`. */
	CSSSelectorMainId,

	/** It includes identifier `.`. */
	CSSSelectorMainClass,

	/** `--variable-name: ...;` */
	CSSVariableDeclaration,

	/** `property: var(--variable-name);` */
	CSSVariableReference,
}


/** 
 * Part is normally a tag, class, id attribute, or tag/class/id selector, or a css variable.
 * Trees will be destroyed, and parts will be cached, so ensure part cost few memories.
 */
export class Part {

	/** Get css part type from text which includes identifiers like `.`, `#`. */
	static getCSSSelectorTypeByText(text: string): PartType {
		if (text[0] === '#') {
			return PartType.CSSSelectorMainId
		}
		else if (text[0] === '.') {
			return PartType.CSSSelectorMainClass
		}
		else {
			return PartType.Tag
		}
	}

	/** `ab` -> /\bab/i. */
	static makeWordStartsMatchExp(text: string): RegExp {
		if (/^[a-z]/i.test(text)) {
			return new RegExp('\\b' + escapeAsRegExpSource(text), 'i')
		}
		else {
			return new RegExp(escapeAsRegExpSource(text), 'i')
		}
	}

	/** `ab` -> /^ab/i. */
	static makeStartsMatchExp(text: string): RegExp {
		return new RegExp('^' + escapeAsRegExpSource(text), 'i')
	}

	
	/** Part type. */
	readonly type: PartType

	/** 
	 * Label, it may or may not include identifiers like `.`, `#` from raw text.
	 * For `<div class="|name|">`, it doesn't include identifier
	 * For `|.class|{}`, it includes identifier.
	 */
	readonly text: string

	/** Offset of start. */
	readonly start: number

	constructor(type: PartType, label: string, start: number) {
		this.type = type
		this.text = label
		this.start = start
	}

	/** End offset. */
	get end() {
		return this.start + this.text.length
	}

	/** Returns text or content as list. */
	get textList(): string[] {
		return [this.text]
	}

	isHTMLType() {
		return this.type < PartType.CSSSelector
			&& this.type >= PartType.Tag
	}

	isCSSType() {
		return this.type >= PartType.CSSSelector
	}

	isCSSVariableType() {
		return this.type === PartType.CSSVariableAssignment
			|| this.type === PartType.CSSVariableDeclaration
			|| this.type === PartType.CSSVariableReference
	}

	isDefinitionType() {
		return this.type === PartType.CSSSelector
			|| this.type === PartType.CSSSelectorMainTag
			|| this.type === PartType.CSSSelectorMainId
			|| this.type === PartType.CSSSelectorMainClass
			|| this.type === PartType.CSSVariableDeclaration
	}

	isReferenceType() {
		return this.type === PartType.Tag
			|| this.type === PartType.Id
			|| this.type === PartType.Class
			|| this.type === PartType.CSSSelectorQueryTag
			|| this.type === PartType.CSSSelectorQueryId
			|| this.type === PartType.CSSSelectorQueryClass
			|| this.type === PartType.CSSVariableAssignment
			|| this.type === PartType.CSSVariableReference
	}

	isSelectorType() {
		return this.type === PartType.Tag
			|| this.type === PartType.Id
			|| this.type === PartType.Class
			|| this.type === PartType.CSSSelectorQueryTag
			|| this.type === PartType.CSSSelectorQueryId
			|| this.type === PartType.CSSSelectorQueryClass
			|| this.type === PartType.CSSSelector
			|| this.type === PartType.CSSSelectorMainTag
			|| this.type === PartType.CSSSelectorMainId
			|| this.type === PartType.CSSSelectorMainClass
	}

	/** Translate start offset. */
	translate(offset: number): Part {
		return new Part(this.type, this.text, this.start + offset)
	}

	/** `"ab"` => `ab`. */
	removeQuotes(): Part {
		let text = this.text
		let start = this.start

		if (hasQuotes(text)) {
			text = text.slice(1, -1)
			start++
			
			return new Part(this.type, text, start)
		}
		else {
			return this
		}
	}

	/** Trim text. */
	trim(): Part {
		let text = this.text
		let start = this.start

		if (/^\s+/.test(text)) {
			text = text.trimLeft()
			start += this.text.length - text.length
			
			return new Part(this.type, text, start)
		}

		if (/\s+$/.test(text)) {
			text = text.trimRight()
		}

		if (text !== this.text) {
			return new Part(this.type, text, start)
		}
		else {
			return this
		}
	}

	/** Transform to definition type for doing match. */
	toDefinitionMode() {
		let type = this.typeToDefinition()
		let text = this.textToDefinition()

		return new Part(type, text, -1)
	}

	/** Convert current type to definition part type. */
	typeToDefinition(): PartType {
		if (this.type === PartType.Tag) {
			return PartType.CSSSelectorMainTag
		}
		else if (this.type === PartType.Id) {
			return PartType.CSSSelectorMainId
		}
		else if (this.type === PartType.Class) {
			return PartType.CSSSelectorMainClass
		}
		else if (this.type === PartType.CSSSelectorQueryTag) {
			return PartType.CSSSelectorMainTag
		}
		else if (this.type === PartType.CSSSelectorQueryId) {
			return PartType.CSSSelectorMainId
		}
		else if (this.type === PartType.CSSSelectorQueryClass) {
			return PartType.CSSSelectorMainClass
		}
		else if (this.type === PartType.CSSVariableAssignment ||this. type === PartType.CSSVariableReference) {
			return PartType.CSSVariableDeclaration
		}

		return this.type
	}

	/** Convert current text to definition part text. */
	textToDefinition(): string {
		let text = this.text

		if (this.type === PartType.Id) {
			text = '#' + text
		}
		else if (this.type === PartType.Class) {
			text = '.' + text
		}

		return text
	}

	/** 
	 * Whether typeof current HTML reference part matches type of a CSS definition part.
	 * Use it for finding references and do class name completions for a css document.
	 */
	isTypeMatchAsReference(matchPart: Part): boolean {
		return this.typeToDefinition() === matchPart.type

			// Means can't search within types of itself.
			&& this.type !== matchPart.type

			&& this.textToDefinition() === matchPart.text
	}

	/** 
	 * Whether current HTML reference part matches a CSS definition part.
	 * Use it for finding references.
	 */
	isMatchAsReference(matchPart: Part): boolean {
		return this.isTypeMatchAsReference(matchPart)
			&& this.textToDefinition() === matchPart.text
	}

	/** 
	 * Whether part is totally match another part,
	 * means both type and text match.
	 * Use it for finding definition and hover.
	 */
	isMatch(matchPart: Part): boolean {
		return this.type === matchPart.type
			&& this.text === matchPart.text
	}

	/** 
	 * Whether part text is wild match an regexp.
	 * Use it for finding workspace symbol.
	 */
	isTextExpMatch(re: RegExp) {
		return re.test(this.text)
	}

	/** Get a range from its related document. */
	toRange(document: TextDocument): Range {
		return Range.create(document.positionAt(this.start), document.positionAt(this.end))
	}

	/** To a location link for going to definition. */
	toLocationLink(document: TextDocument, fromPart: Part, fromDocument: TextDocument) {
		let range = this.toRange(document)
		let fromRange = fromPart.toRange(fromDocument)

		return LocationLink.create(document.uri, range, range, fromRange)
	}

	/** To a location for finding references. */
	toLocation(document: TextDocument) {
		return Location.create(document.uri, this.toRange(document))
	}

	/** To several symbol information for workspace symbol searching. */
	toSymbolInformationList(document: TextDocument): SymbolInformation[] {
		let kind = this.type === PartType.CSSSelector
			|| this.type === PartType.CSSSelectorMainTag
			|| this.type === PartType.CSSSelectorMainClass
			|| this.type === PartType.CSSSelectorMainId
				? SymbolKind.Class
				: SymbolKind.Variable

		return this.textList.map(text => SymbolInformation.create(
			text,
			kind,
			this.toRange(document),
			document.uri
		))
	}

	/** To completion item list. */
	toCompletionItems(labels: string[], document: TextDocument): CompletionItem[] {
		let kind = this.type === PartType.CSSSelector
			|| this.type === PartType.CSSSelectorMainTag
			|| this.type === PartType.CSSSelectorMainClass
			|| this.type === PartType.CSSSelectorMainId
			|| this.type === PartType.Tag
			|| this.type === PartType.Class
			|| this.type === PartType.Id
				? CompletionItemKind.Class
				: CompletionItemKind.Variable

		return labels.map(text => {
			let item = CompletionItem.create(text)
			item.kind = kind
	
			item.textEdit = TextEdit.replace(
				this.toRange(document),
				text,
			)

			return item
		})
	}

	/** To hover. */
	toHover(comment: string | undefined, document: TextDocument): Hover {
		let cssPart = this.toDefinitionMode()
		let content = cssPart.text

		if (comment) {
			content += '\n' + comment
		}

		return {
			contents: {
				kind: MarkupKind.PlainText,
				value: content,
			},
			range: this.toRange(document)
		}
	}
}

