import {HTMLToken, HTMLTokenScanner, HTMLTokenType} from '../scanners/html'
import {Part, PartType} from './part'
import {mayBeExpression} from './utils'
import {Picker} from './picker'
import {isCSSLikePath} from '../../helpers'
import {CSSTokenTree} from './css-tree'
import {HTMLTokenNode} from './html-node'


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


export class HTMLTokenTree extends HTMLTokenNode {

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>, isJSLikeSyntax: boolean = false): HTMLTokenTree {
		let tree = new HTMLTokenTree(isJSLikeSyntax)
		let current: HTMLTokenNode = tree
		let currentAttr: {name: HTMLToken, value: HTMLToken | null} | null = null

		for (let token of tokens) {
			if (token.type === HTMLTokenType.StartTagName) {
				let tagNode: HTMLTokenNode = new HTMLTokenNode(token, current)
				current.children!.push(tagNode)
				current = tagNode
			}

			else if (token.type === HTMLTokenType.EndTagName) {
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
			}

			else if (token.type === HTMLTokenType.TagEnd) {
				if (current && current.token.type === HTMLTokenType.StartTagName
					&& SelfClosingTags.includes(current.token.text)
				) {
					current = current.parent ?? tree
				}
			}

			else if (token.type === HTMLTokenType.SelfCloseTagEnd) {
				if (current && current.token.type === HTMLTokenType.StartTagName) {
					current = current.parent ?? tree
				}
			}
			
			else if (token.type === HTMLTokenType.AttributeName) {
				if (current && current.token.type === HTMLTokenType.StartTagName) {
					currentAttr = {name: token, value: null}
					current.attrs!.push(currentAttr)
				}
			}

			else if (token.type === HTMLTokenType.AttributeValue) {
				if (currentAttr) {
					currentAttr.value = token
				}
			}

			else if (token.type === HTMLTokenType.Text) {
				let textNode = new HTMLTokenNode(token, current)
				current.children!.push(textNode)
			}

			else if (token.type === HTMLTokenType.CommentText) {
				let commentNode = new HTMLTokenNode(token, current)
				current.children!.push(commentNode)
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
			end: -1,
		}, null)

		this.isJSLikeSyntax = isJSLikeSyntax
	}
	
	/** Quickly find a part at specified offset. */
	findPart(offset: number): Part | undefined {
		let walking = this.filterWalk((node: HTMLTokenNode) => {
			return node.token.start >= offset && node.closureLikeEnd <= offset
		})

		for (let node of walking) {
			if (node.token.start > offset || node.tagLikeEnd < offset) {
				continue
			}

			for (let part of this.parseNodeParts(node)) {
				if (part.start >= offset && part.end <= offset) {
					return part
				}
			}
		}

		return undefined
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			if (node.token.start === -1) {
				return
			}

			yield* this.parseNodeParts(node)
		}
	}

	/** Parse node and attributes. */
	protected *parseNodeParts(node: HTMLTokenNode): Iterable<Part> {
		if (node.token.type === HTMLTokenType.StartTagName) {
			yield new Part(PartType.Tag, node.token.text, node.token.start)

			for (let attr of node.attrs!) {
				yield* this.parseAttrPart(attr.name, attr.value)
			}

			yield* this.parseImportPart(node)

			if (node.tagName === 'script') {
				yield* this.parseScriptPart(node)
			}
			else if (node.tagName === 'style') {
				yield* this.parseStylePart(node)
			}
		}
		
		// Parsing text parts as script may be expensive.
		if (this.isJSLikeSyntax && node.token.type === HTMLTokenType.Text) {
			yield* this.parseScriptTextParts(node)
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
			yield new Part(PartType.Class, attrName.text.slice(7), attrName.start + 7)
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
		if (node.tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				let href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.ImportPath, href.text, href.start).removeQuotes()
				}
			}
		}

		// Vue.js only.
		else if (node.tagName === 'style') {
			let src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.ImportPath, src.text, src.start).removeQuotes()
			}
		}
	}

	/** For react css module. */
	protected *parseReactModulePart(attrValue: HTMLToken): Iterable<Part> {
		let start = attrValue.start

		// `class={style.className}`.
		// `class={style['class-name']}`.
		let match = Picker.locateMatchGroups(
			attrValue.text,
			/^\s*\{\s*(?<moduleName>\w+)(?:\.(?<propertyName>\w+)|\[\s*['"`](?<propertyName>\w+)['"`]\s*\])\s*\}\s*$/
		)

		if (match) {
			yield new Part(PartType.ReactImportedCSSModuleName, match.moduleName.text, match.moduleName.start + start)
			yield new Part(PartType.ReactImportedCSSModuleProperty, match.propertyName.text, match.propertyName.start + start)
		}
	}

	/** Parse script tag for parts. */
	protected *parseScriptPart(node: HTMLTokenNode): Iterable<Part> {
		let textNode = node.firstTextNode
		if (textNode && textNode.token.text) {
			yield* this.parseScriptTextParts(textNode)
		}
	}

	/** Parse script content for parts. */
	protected *parseScriptTextParts(node: HTMLTokenNode): Iterable<Part> {
		let text = node.token.text
		let start = node.token.start

		// `querySelect('.class-name')`
	 	// `$('.class-name')`
		let matches = Picker.locateAllMatches(
			text,
			/(?:\$|\.querySelect|\.querySelectAll)\s*\(\s*['"`](.*?)['"`]/g
		)

		for (let match of matches) {
			yield new Part(PartType.SelectorQuery, match[1].text, match[1].start + start).trim()
		}


		// setProperty('--variable-name')
		matches = Picker.locateAllMatches(
			text,
			/\.setProperty\s*\(\s*\(\s*['"`](--.*?)['"`]/g
		)

		for (let match of matches) {
			yield new Part(PartType.CSSVariableAssignment, match[1].text, match[1].start + start).trim()
		}


		// `import * from '...'`
		// `import abc from '...'`
		// `import '...'`
		matches = Picker.locateAllMatches(
			text,
			/import\s+(?:\w+\s+from\s+)?['"`](.+?)['"`]/g
		)

		for (let match of matches) {
			let path = match[1].text

			if (isCSSLikePath(path)) {
				yield new Part(PartType.CSSImportPath, match[1].text, match[1].start + start).trim()
			}
		}
	}

	/** Parse style tag for parts. */
	protected *parseStylePart(node: HTMLTokenNode): Iterable<Part> {
		let textNode = node.firstTextNode
		if (textNode) {
			let languageId = node.getAttributeValue('lang') ?? 'css'
			yield* this.parseStyleTextParts(textNode, languageId as CSSLanguageId)
		}
	}

	/** Parse style content for parts. */
	protected *parseStyleTextParts(node: HTMLTokenNode, languageId: CSSLanguageId): Iterable<Part> {
		let text = node.token.text
		let start = node.token.start
		let cssTree = CSSTokenTree.fromString(text, languageId)

		for (let part of cssTree.walkParts()) {
			yield part.translate(start)
		}
	}
}