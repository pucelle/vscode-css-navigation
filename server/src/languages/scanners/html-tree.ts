import {HTMLToken, HTMLTokenScanner, HTMLTokenType} from './html'
import {Part, PartType} from './part'
import {mayBeExpression, removeQuotes} from './utils'
import {WordsPicker} from './words-picker'


/** 
 * Tags that self closing.
 * Reference from https://developer.mozilla.org/en-US/docs/Glossary/Void_element
 */
const SelfClosingTags = [
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]


/** Build a simple tree by tokens. */
export class HTMLTokenNode {

	readonly token: HTMLToken
	readonly parent: HTMLTokenNode | null
	readonly attrs: {name: HTMLToken, value: HTMLToken | null}[] | null
	readonly children: HTMLTokenNode[] | null

	constructor(token: HTMLToken, parent: HTMLTokenNode | null) {
		this.token = token
		this.parent = parent

		if (token.type === HTMLTokenType.StartTagName) {
			this.attrs = []
			this.children = []
		}
		else {
			this.attrs = null
			this.children = null
		}
	}

	/** Get tag name start. */
	get tagStart(): number {
		return this.token.start
	}

	/** Get tag end, normally after last attribute. */
	get tagEnd(): number {
		if (this.attrs && this.attrs.length > 0) {
			let lastAttr = this.attrs[this.attrs.length - 1]

			if (lastAttr.value) {
				return lastAttr.value.start + lastAttr.value.text.length
			}
			else {
				return lastAttr.name.start + lastAttr.name.text.length
			}
		}

		return this.token.start + this.token.text.length
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

	*walk(): Iterable<HTMLTokenNode> {
		yield this

		if (this.children) {
			for (let child of this.children) {
				yield* child.walk()
			}
		}
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.walkNodePart(node)
		}
	}

	protected *walkNodePart(node: HTMLTokenNode): Iterable<Part> {

		// Root node.
		if (node.token.start === -1) {
			return
		}

		if (node.token.type === HTMLTokenType.StartTagName) {
			yield new Part(PartType.Tag, node.token.text, node.token.start)

			for (let attr of node.attrs!) {
				yield* this.walkAttrPart(attr.name, attr.value)
			}

			yield* this.walkImport(node)
		}
	}

	/** For attribute part. */
	protected *walkAttrPart(attrName: HTMLToken, attrValue: HTMLToken | null): Iterable<Part> {
		let name = attrName.text

		if (name === 'id') {
			if (attrValue) {
				yield new Part(PartType.Id, attrValue.text, attrValue.start).removeQuotes()
			}
		}

		// For `Lupos.js`, completion `:class.|name|`
		else if (name.startsWith(':class.')) {
			yield new Part(PartType.ClassBinding, attrName.text.slice(7), attrName.start + 7)
		}

		// For `JSX`, `Lupos.js`, `Vue.js`
		else if (name === 'class' || name === 'className' || name === ':class') {
			if (attrValue) {
				let value = attrValue.text

				// Probable expression.
				if (mayBeExpression(value)) {
					for (let word of WordsPicker.pickWordsFromExpression(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}
				}
				else {
					for (let word of WordsPicker.pickWords(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}
				}
			}
		}
	}

	/** For import path. */
	protected *walkImport(node: HTMLTokenNode): Iterable<Part> {
		let tagName = node.token.text

		if (tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				let href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.Import, href.text, href.start).removeQuotes()
				}
			}
		}
		else if (tagName === 'style') {
			let src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.Import, src.text, src.start).removeQuotes()
			}
		}
	}

	findPart(offset: number): Part | undefined {
		for (let node of this.walk()) {
			if (node.tagStart > offset) {
				break
			}

			if (node.tagEnd <= offset) {
				for (let part of this.walkNodePart(node)) {
					if (part.start >= offset && part.end <= offset) {
						return part
					}
				}
			}
		}

		return undefined
	}
}


export class HTMLTokenTree extends HTMLTokenNode {

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>): HTMLTokenTree {
		let tree = new HTMLTokenTree()
		let current: HTMLTokenNode | null = tree
		let currentAttr: {name: HTMLToken, value: HTMLToken | null} | null = null

		for (let token of tokens) {
			switch (token.type) {
				case HTMLTokenType.StartTagName:
					let tagNode: HTMLTokenNode = new HTMLTokenNode(token, current)
					current.children!.push(tagNode)
					current = tagNode
					break

				case HTMLTokenType.EndTagName:
					do {

						// </name>
						if (current.token.text === token.text) {
							current = current.parent ?? tree
							break
						}

						// </>
						if (token.text === '') {
							current = current.parent ?? tree
							break
						}

						current = current.parent ?? tree
					} while (current)
					break

				case HTMLTokenType.TagEnd:
					if (current && current.token.type === HTMLTokenType.StartTagName
						&& SelfClosingTags.includes(current.token.text)
					) {
						current = current.parent ?? tree
					}
					break

				case HTMLTokenType.SelfCloseTagEnd:
					if (current && current.token.type === HTMLTokenType.StartTagName) {
						current = current.parent ?? tree
					}
					break
				
				case HTMLTokenType.AttributeName:
					if (current && current.token.type === HTMLTokenType.StartTagName) {
						currentAttr = {name: token, value: null}
						current.attrs!.push(currentAttr)
					}
					break

				case HTMLTokenType.AttributeValue:
					if (currentAttr) {
						currentAttr.value = token
					}
					break

				case HTMLTokenType.Text:
					let textNode = new HTMLTokenNode(token, current)
					current.children!.push(textNode)
					break

				case HTMLTokenType.Comment:
					let commentNode = new HTMLTokenNode(token, current)
					current.children!.push(commentNode)
					break
			}

			if (!current) {
				break
			}
		}

		return tree
	}

	/** Make a HTML token tree by string. */
	static fromString(string: string): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string).parseToTokens()
		return HTMLTokenTree.fromTokens(tokens)
	}

	/** Make a partial HTML token tree by string and offset. */
	static fromStringAndOffset(string: string, offset: number): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string).parsePartialTokens(offset)
		return HTMLTokenTree.fromTokens(tokens)
	}

	constructor() {
		super({
			type: HTMLTokenType.StartTagName,
			text: 'root',
			start: -1,
		}, null)
	}
}