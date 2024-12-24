import {HTMLToken, HTMLTokenScanner, HTMLTokenType} from './html'
import {Part, PartType} from './part'
import {mayBeExpression, removeQuotes} from './utils'
import {Picker} from './picker'
import {isCSSLikePath} from '../../helpers'


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
}


export class HTMLTokenTree extends HTMLTokenNode {

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>, isJSLikeSyntax: boolean = false): HTMLTokenTree {
		let tree = new HTMLTokenTree(isJSLikeSyntax)
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
	static fromString(string: string, isJSLikeSyntax: boolean = false): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string).parseToTokens()
		return HTMLTokenTree.fromTokens(tokens, isJSLikeSyntax)
	}

	/** Make a partial HTML token tree by string and offset. */
	static fromStringAtOffset(string: string, offset: number, isJSLikeSyntax: boolean = false): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string).parsePartialTokens(offset)
		return HTMLTokenTree.fromTokens(tokens, isJSLikeSyntax)
	}


	readonly isJSLikeSyntax: boolean

	constructor(isJSLikeSyntax: boolean) {
		super({
			type: HTMLTokenType.StartTagName,
			text: 'root',
			start: -1,
		}, null)

		this.isJSLikeSyntax = isJSLikeSyntax
	}
	
	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			
			// Root node.
			if (node.token.start === -1) {
				return
			}

			yield* this.parseNodeParts(node)
		}
	}

	protected *parseNodeParts(node: HTMLTokenNode): Iterable<Part> {
		if (node.token.type === HTMLTokenType.StartTagName) {
			yield new Part(PartType.Tag, node.token.text, node.token.start)

			for (let attr of node.attrs!) {
				yield* this.parseAttrPart(attr.name, attr.value)
			}

			yield* this.parseImportPart(node)
		}
		else if (node.token.type === HTMLTokenType.Text) {
			yield* this.parseTextParts(node)
		}
	}

	/** For attribute part. */
	protected *parseAttrPart(attrName: HTMLToken, attrValue: HTMLToken | null): Iterable<Part> {
		let name = attrName.text

		if (name === 'id') {
			if (attrValue) {
				yield new Part(PartType.Id, attrValue.text, attrValue.start).removeQuotes()
			}
		}

		// For `Lupos.js`, completion `:class.|name|`
		else if (this.isJSLikeSyntax && name.startsWith(':class.')) {
			yield new Part(PartType.ClassBinding, attrName.text.slice(7), attrName.start + 7)
		}

		// For `JSX`, `Lupos.js`, `Vue.js`
		else if (name === 'class' || name === 'className' || name === ':class') {
			if (attrValue) {
				let value = attrValue.text

				// Probably expression.
				if (this.isJSLikeSyntax && mayBeExpression(value)) {
					for (let word of Picker.pickWordsFromExpression(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}

					this.parseReactModulePart(attrValue)
				}
				else {
					for (let word of Picker.pickWords(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}
				}
			}
		}

		// https://github.com/gajus/babel-plugin-react-css-modules and issue #60.
		// import 'xx.css'
		// `styleName="class-name"`
		else if (this.isJSLikeSyntax && name === 'styleName') {
			if (attrValue) {
				yield new Part(PartType.ReactDefaultImportedCSSModule, attrValue.text, attrValue.start).removeQuotes()
			}
		}
	}

	/** For import path. */
	protected *parseImportPart(node: HTMLTokenNode): Iterable<Part> {
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

	/** For react css module. */
	protected *parseReactModulePart(attrValue: HTMLToken): Iterable<Part> {

		// `class={style.className}`.
		// `class={style['class-name']}`.
		let match = Picker.locateMatchGroups(
			attrValue.text,
			/^\s*\{\s*(?<moduleName>\w+)(?:\.(?<propertyName>\w+)|\[\s*['"`](?<propertyName>\w+)['"`]\s*\])\s*\}\s*$/
		)

		if (match) {
			yield new Part(PartType.ReactImportedCSSModuleName, match.moduleName.text, match.moduleName.start)
			yield new Part(PartType.ReactImportedCSSModuleProperty, match.propertyName.text, match.propertyName.start)
		}
	}

	/** Parse text for parts. */
	protected *parseTextParts(node: HTMLTokenNode): Iterable<Part> {
		if (!this.isJSLikeSyntax) {
			return
		}

		// `querySelect('.class-name')`
	 	// `$('.class-name')`
		let match = Picker.locateMatches(
			node.token.text!,
			/(?:\$|\.querySelect|\.querySelectAll)\s*\(\s*['"`](.*?)['"`]/
		)

		if (match) {
			yield new Part(PartType.SelectorQuery, match[1].text, match[1].start).trim()
		}

		// import * from '...'
		// import abc from '...'
		// import '...'

		for (let match of Picker.locateAllMatches(node.token.text!, /import\s+(?:\w+\s+from\s+)?['"`](.+?)['"`]/g)) {
			let path = match[1].text
			
			if (isCSSLikePath(path)) {
				yield new Part(PartType.CSSImportPath, match[1].text, match[1].start).trim()
			}
		}
	}

	findPart(offset: number): Part | undefined {
		for (let node of this.walk()) {
			if (node.tagStart > offset) {
				break
			}

			if (node.tagEnd <= offset) {
				for (let part of this.parseNodeParts(node)) {
					if (part.start >= offset && part.end <= offset) {
						return part
					}
				}
			}
		}

		return undefined
	}
}