import {PartConvertor} from './part-convertor'
import {hasQuotes} from './utils'


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
	ReactDefaultImportedCSSModuleClass,


	//// From CSS.

	/** Any selector string like `#id`, `.class-name`. */
	CSSSelector,

	/** div{...} */
	CSSSelectorTag,

	/** It includes identifier `#`. */
	CSSSelectorId,

	/** It includes identifier `.`. */
	CSSSelectorClass,

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
	
	/** Part type. */
	readonly type: PartType

	/** 
	 * Label, it may or may not include identifiers like `.`, `#` from raw text.
	 * For `<div class="|name|">`, it doesn't include identifier
	 * For `|.class|{}`, it includes identifier.
	 */
	readonly text: string

	/** Start offset. */
	start: number

	/** End of Definition. */
	defEnd: number

	constructor(type: PartType, label: string, start: number, declarationEnd: number = -1) {
		this.type = type
		this.text = label
		this.start = start
		this.defEnd = declarationEnd
	}

	/** End offset. */
	get end() {
		return this.start + this.text.length
	}

	/** Returns text or content as list. */
	get textList(): string[] {
		return [this.text]
	}

	/** 
	 * If is `CSSSelectorPart`, returns primary text list.
	 * Otherwise returns current text list.
	 */
	get mayPrimaryTextList(): string[] {
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
			|| this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
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
			|| this.type === PartType.ReactDefaultImportedCSSModuleClass
			|| this.type === PartType.ReactImportedCSSModuleProperty
	}

	isSelectorType() {
		return this.type === PartType.Tag
			|| this.type === PartType.Id
			|| this.type === PartType.Class
			|| this.type === PartType.CSSSelectorQueryTag
			|| this.type === PartType.CSSSelectorQueryId
			|| this.type === PartType.CSSSelectorQueryClass
			|| this.type === PartType.CSSSelector
			|| this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
			|| this.type === PartType.ReactDefaultImportedCSSModuleClass
			|| this.type === PartType.ReactImportedCSSModuleProperty
	}

	/** `"ab"` => `ab`. */
	removeQuotes(): Part {
		let text = this.text
		let start = this.start

		if (hasQuotes(text)) {
			text = text.slice(1, -1)
			start++
			
			return new Part(this.type, text, start, this.defEnd)
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
			
			return new Part(this.type, text, start, this.defEnd)
		}

		if (/\s+$/.test(text)) {
			text = text.trimRight()
		}

		if (text !== this.text) {
			return new Part(this.type, text, start, this.defEnd)
		}
		else {
			return this
		}
	}

	/** Transform to definition type, normally use it for matching. */
	toDefinitionMode() {
		let type = PartConvertor.typeToDefinition(this.type)
		let text = PartConvertor.textToType(this.text, this.type, type)

		return new Part(type, text, -1, -1)
	}

	/** 
	 * Whether typeof current HTML reference part matches type of a CSS definition part.
	 * Use it for finding references and do class name completions for a css document.
	 */
	isTypeMatchAsReference(definitionPart: Part): boolean {
		return this.isReferenceType()
			&& PartConvertor.typeToDefinition(this.type) === definitionPart.type
	}

	/** 
	 * Whether current HTML reference part matches a CSS definition part.
	 * Use it for finding references.
	 */
	isMatchAsReference(definitionPart: Part): boolean {
		return this.isTypeMatchAsReference(definitionPart)
			&& PartConvertor.textToType(this.text, this.type, definitionPart.type) === definitionPart.text
	}

	/** Whether part type matches another part. */
	isTypeMatch(matchPart: Part): boolean {
		return this.type === matchPart.type
	}

	/** 
	 * Whether part is totally match another part,
	 * means both type and text match.
	 * Use it for finding definition and hover.
	 */
	isMatch(matchPart: Part): boolean {
		return this.isTypeMatch(matchPart)
			&& this.text === matchPart.text
	}

	/** 
	 * Whether part text is wild match an regexp.
	 * Use it for finding workspace symbol.
	 */
	isTextExpMatch(re: RegExp): boolean {
		return re.test(this.text)
	}

	/** 
	 * If is `CSSSelectorPart`, do primary type match.
	 * Otherwise do normal type match.
	 */
	isMayPrimaryTypeMatch(matchPart: Part): boolean {
		return this.isTypeMatch(matchPart)
	}

	/** 
	 * If is `CSSSelectorPart`, do primary match.
	 * Otherwise do normal match.
	 */
	isMayPrimaryMatch(matchPart: Part): boolean {
		return this.isMatch(matchPart)
	}

	/** 
	 * If is `CSSSelectorPart`, do primary text exp match.
	 * Otherwise do normal text exp match.
	 */
	isMayPrimaryTextExpMatch(re: RegExp): boolean {
		return this.isTextExpMatch(re)
	}
}

