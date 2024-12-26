import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {hasQuotes} from './utils'


/** Part types. */
export enum PartType {

	////
	Import,


	//// From HTML.

	Id,
	Tag,
	Class,
	ClassBinding,

	/** 
	 * Import 'file.css'
	 * Import name from 'file.css'
	 */
	CSSImportPath,

	/**
	 * `class={style.className}`
	 * `class={style['class-name']}`
	*/
	ReactImportedCSSModuleName,
	ReactImportedCSSModuleProperty,

	/**
	 * import 'xx.css'
	 * `styleName="class-name"`
	*/
	ReactDefaultImportedCSSModule,

	/**
	 * `querySelect('.class-name')`
	 * `$('.class-name')`
	 */
	SelectorQuery,

	/** `style.setProperty('--variable-name', ...)` */
	CSSVariableAssignment,


	//// From CSS.

	/** `#id`, `.class-name`. */
	CSSSelector,

	/** `--variable-name: ...;` */
	CSSVariableDeclaration,

	/** `property: var(--variable-name);` */
	CSSVariableReference,
}

/** Part is normally a tag/class/id selector, or a css variable. */
export class Part {
	
	/** Part type. */
	readonly type: PartType

	/** Raw text, it should include identifiers like `.`, `#`. */
	readonly text: string

	/** Offset of start. */
	readonly start: number

	constructor(type: PartType, text: string, startOffset: number) {
		this.type = type
		this.text = text
		this.start = startOffset
	}

	get identifier(): string {
		if (this.type === PartType.Id) {
			return '#'
		}
		else if (this.type === PartType.Class) {
			return '.'
		}
		else {
			return ''
		}
	}

	/** End offset. */
	get end() {
		return this.start + this.text.length
	}

	/** Get  string exclude identifier. */
	get label(): string {
		let identifier = this.identifier

		if (this.text.startsWith(identifier)) {
			return this.text.slice(identifier.length)
		}

		return this.text
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
	
	/** Get a range from its related document. */
	toRange(document: TextDocument): Range {
		return Range.create(document.positionAt(this.start), document.positionAt(this.end))
	}
}
