import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {hasQuotes} from './utils'


/** Part types. */
export enum PartType {

	/** Shared. */
	Import,

	/** From HTML. */
	Id,
	Tag,
	Class,
	ClassBinding,

	/** From CSS. */
	IdSelector,
	TagSelector,
	ClassSelector,
	CSSVariableDeclaration,
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
		if (this.type === PartType.IdSelector) {
			return '#'
		}
		else if (this.type === PartType.ClassSelector) {
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

	/** Whether a custom tag. */
	isCustomTag(): boolean {
		return (this.type === PartType.Tag || this.type === PartType.TagSelector) && this.text.includes('-')
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
	
	/** Get a range from its related document. */
	toRange(document: TextDocument): Range {
		return Range.create(document.positionAt(this.start), document.positionAt(this.end))
	}
}
