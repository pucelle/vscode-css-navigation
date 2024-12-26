import {HTMLToken, HTMLTokenType} from '../scanners'
import {removeQuotes} from './utils'
import {AnyTokenNode} from './any-node'


/** Build a simple tree by tokens. */
export class HTMLTokenNode extends AnyTokenNode<HTMLToken> {

	declare readonly parent: HTMLTokenNode | null
	declare readonly children: HTMLTokenNode[] | null

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
		if (this.attrs && this.attrs.length > 0) {
			let lastAttr = this.attrs[this.attrs.length - 1]

			if (lastAttr.value) {
				return lastAttr.value.start + lastAttr.value.text.length
			}
			else {
				return lastAttr.name.start + lastAttr.name.text.length
			}
		}

		return this.token.end
	}

	/** 
	 * Get closure end, normally after last child end.
	 * If not tag, returns token end.
	 */
	get closureLikeEnd(): number {
		if (this.children && this.children.length > 0) {
			return this.children[this.children.length - 1].closureLikeEnd
		}

		return this.tagLikeEnd
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