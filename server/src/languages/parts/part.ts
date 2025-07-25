import {hasQuotes} from '../trees/utils'
import {CSSSelectorWrapperPart} from './part-css-selector-wrapper'
import {CSSSelectorDetailedPart} from './part-css-selector-detailed'
import {CSSVariableDefinitionPart} from './part-css-variable-definition'


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

	/** Excludes tags starts with A~Z like React or Lupos Component. */
	Tag,

	/** Like React or Lupos Component. */
	ComponentTag,

	/** It doesn't include identifier `#`. */
	Id,

	/** It doesn't include identifier `.`. */
	Class,

	/** To do completion like `class="|"`. */
	ClassPotential,

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

	/** Wrapper all other selector parts. */
	CSSSelectorWrapper,

	/** div{...} */
	CSSSelectorTag,

	/** It includes identifier `#`. */
	CSSSelectorId,

	/** It includes identifier `.`. */
	CSSSelectorClass,

	/** `--variable-name: ...;` */
	CSSVariableDefinition,

	/** `-`, `--`, or `--property`, no value specified yet. */
	CSSVariableDefinitionNotComplete,

	/** `property: var(--variable-name);` */
	CSSVariableReference,

	/** `property: --variable-name`, only for completion. */
	CSSVariableReferenceNoVar,
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

	/** HTML class and id attribute. */
	isHTMLType() {
		return this.type < PartType.CSSSelectorWrapper
			&& this.type >= PartType.Tag
	}

	/** CSS selector and variables. */
	isCSSType() {
		return this.type >= PartType.CSSSelectorWrapper
	}

	isCSSVariableType() {
		return this.type === PartType.CSSVariableAssignment
			|| this.type === PartType.CSSVariableDefinition
			|| this.type === PartType.CSSVariableDefinitionNotComplete
			|| this.type === PartType.CSSVariableReference
			|| this.type === PartType.CSSVariableReferenceNoVar
	}

	isCSSVariableDefinitionType(): this is CSSVariableDefinitionPart {
		return this.type === PartType.CSSVariableDefinition
	}

	isDefinitionType() {
		return this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
			|| this.type === PartType.CSSVariableDefinition
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

	isSelectorWrapperType(): this is CSSSelectorWrapperPart {
		return this.type === PartType.CSSSelectorWrapper
	}

	isSelectorType() {
		return this.type === PartType.Tag
			|| this.type === PartType.Id
			|| this.type === PartType.Class
			|| this.type === PartType.CSSSelectorQueryTag
			|| this.type === PartType.CSSSelectorQueryId
			|| this.type === PartType.CSSSelectorQueryClass
			|| this.type === PartType.CSSSelectorWrapper
			|| this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
			|| this.type === PartType.ReactDefaultImportedCSSModuleClass
			|| this.type === PartType.ReactImportedCSSModuleProperty
	}

	isSelectorDetailedType(): this is CSSSelectorDetailedPart {
		return this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
	}

	/** Only definition part has formatted list. */
	hasFormattedList(): this is CSSSelectorWrapperPart | CSSSelectorDetailedPart {
		return this.type === PartType.CSSSelectorWrapper
			|| this.type === PartType.CSSSelectorTag
			|| this.type === PartType.CSSSelectorId
			|| this.type === PartType.CSSSelectorClass
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
			text = text.trimStart()
			start += this.text.length - text.length
			
			return new Part(this.type, text, start, this.defEnd)
		}

		if (/\s+$/.test(text)) {
			text = text.trimEnd()
		}

		if (text !== this.text) {
			return new Part(this.type, text, start, this.defEnd)
		}
		else {
			return this
		}
	}
}

