import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'


export class SimpleSelector {

	/** Selector type. */
	readonly type: SimpleSelector.Type

	/** Raw selector string, includes identifier like `.`, `#`. */
	readonly raw: string

	/** Selector string exclude identifier. */
	readonly label: string

	/** Position of left offset. */
	readonly startIndex: number

	/** Text document that current selector attach at. */
	readonly document: TextDocument

	/** Related imported file, only available for JSX files. */
	importURI: string | null

	constructor(type: SimpleSelector.Type, raw: string, label: string, startIndex: number, document: TextDocument, importURI: string | null) {
		this.type = type
		this.raw = raw
		this.label = label
		this.startIndex = startIndex
		this.document = document
		this.importURI = importURI
	}

	/** Whether a custom tag. */
	isCustomTag(): boolean {
		return this.type === SimpleSelector.Type.Tag && this.label.includes('-')
	}

	/** Get a range from its related document. */
	toRange(): Range {
		return Range.create(this.document.positionAt(this.startIndex), this.document.positionAt(this.startIndex + this.raw.length))
	}
}

export namespace SimpleSelector {

	/** Selector types. */
	export enum Type{
		Tag,
		Class,
		Id,
		CSSVariable,
	}
	
	/** Create a selector from raw selector string. */
	export function create(raw: string, startOffset: number = 0, document: TextDocument, importURI: string | null = null): SimpleSelector | null {
		if (!validate(raw)) {
			return null
		}

		let type = getType(raw)
		let label = type === Type.Tag || type === Type.CSSVariable ? raw : raw.slice(1)

		return new SimpleSelector(
			type,
			raw,
			label,
			startOffset,
			document,
			importURI,
		)
	}

	/** Get type. */
	export function getType(raw: string): Type {
		let type = raw[0] === '.' ? Type.Class
			: raw[0] === '#' ? Type.Id
			: raw[0] === '-' && raw[1] === '-' ? Type.CSSVariable
			: Type.Tag

		return type
	}

	/** Whether a string is a valid selector. */
	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
			|| /^--[\w-]+/.test(raw)
	}
}
