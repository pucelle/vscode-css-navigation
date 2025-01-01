import {HTMLToken, HTMLTokenType} from '../scanners'
import {removeQuotes} from './utils'
import {AnyTokenNode} from './any-node'


/** Build a simple tree by tokens. */
export class HTMLTokenNode extends AnyTokenNode<HTMLToken> {

	declare readonly parent: HTMLTokenNode | null
	declare readonly children: HTMLTokenNode[] | null

	/** `<a>|`, for only tag node. */
	tagEnd: number = -1

	readonly attrs: {name: HTMLToken, value: HTMLToken | null}[] | null = null

	constructor(token: HTMLToken, parent: HTMLTokenNode | null) {
		super(token, parent)

		if (token.type === HTMLTokenType.StartTagName) {
			this.attrs = []
			this.children = []
		}
	}

	get tagName(): string | null {
		return this.token.type === HTMLTokenType.StartTagName ? this.token.text : null
	}

	get firstTextNode(): HTMLTokenNode | null {
		if (this.children && this.children.length > 0 && this.children[0].token.type === HTMLTokenType.Text) {
			return this.children[0] as HTMLTokenNode
		}

		return null
	}

	/** 
	 * Get tag end, normally after last attribute.
	 * If not tag, returns token end.
	 */
	get tagLikeEnd(): number {
		return this.tagEnd > -1 ? this.tagEnd : this.token.end
	}

	/** 
	 * Get definition end, `<div>...</div>|`.
	 * If not tag, returns token end.
	 */
	get defLikeEnd(): number {
		return this.defEnd > -1 ? this.defEnd : this.token.end
	}

	/** Attribute value text, with quotes removed. */
	getAttributeValue(name: string): string | null {
		if (!this.attrs) {
			return null
		}

		let attr = this.attrs.find(attr => attr.name.text === name)
		if (attr && attr.value) {
			return removeQuotes(attr.value.text)
		}

		return null
	}

	getAttribute(name: string): HTMLToken | null {
		if (!this.attrs) {
			return null
		}

		let attr = this.attrs.find(attr => attr.name.text === name)
		if (attr) {
			return attr.value
		}

		return null
	}
}