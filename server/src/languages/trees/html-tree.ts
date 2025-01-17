import {HTMLToken, HTMLTokenScanner, HTMLTokenType} from '../scanners/html'
import {Part, PartType} from '../parts'
import {mayBeExpression} from './utils'
import {Picker} from './picker'
import {CSSTokenTree} from './css-tree'
import {HTMLTokenNode} from './html-node'
import {JSTokenTree} from './js-tree'


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

	/** Make a HTML token tree by string. */
	static fromString(string: string, scannerStart: number = 0, languageId: HTMLLanguageId = 'html'): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string, scannerStart, languageId).parseToTokens()
		return HTMLTokenTree.fromTokens(tokens, languageId)
	}

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>, languageId: HTMLLanguageId = 'html'): HTMLTokenTree {
		let tree = new HTMLTokenTree(languageId)
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
				} while (current !== tree)
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


	readonly languageId: HTMLLanguageId

	constructor(languageId: HTMLLanguageId) {
		super({
			type: HTMLTokenType.StartTagName,
			text: 'root',
			start: -1,
			end: -1,
		}, null)

		this.languageId = languageId
	}

	isScriptSyntax(): boolean {
		return this.languageId !== 'html'
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.parseNodeParts(node)
		}
	}

	/** Parse node and attributes. */
	protected *parseNodeParts(node: HTMLTokenNode): Iterable<Part> {
		if (node.token.type === HTMLTokenType.StartTagName) {
			yield new Part(PartType.Tag, node.token.text, node.token.start, node.tagLikeEnd)

			// Parse attributes and sort them.
			yield* this.sortParts(this.parseAttrParts(node))
			
			if (node.tagName === 'script') {
				yield* this.parseScriptPart(node)
			}
			else if (node.tagName === 'style') {
				yield* this.parseStylePart(node)
			}
		}
	}

	/** Parse attributes for parts. */
	protected *parseAttrParts(node: HTMLTokenNode) {
		for (let attr of node.attrs!) {
			yield* this.parseAttrPart(attr.name, attr.value)
		}

		yield* this.parseImportPart(node)
	}

	/** For attribute part. */
	protected *parseAttrPart(attrName: HTMLToken, attrValue: HTMLToken | null): Iterable<Part> {
		let name = attrName.text

		if (name === 'id') {
			if (attrValue) {
				yield new Part(PartType.Id, attrValue.text, attrValue.start).removeQuotes()
			}
		}

		else if (name === 'style') {
			if (attrValue) {
				yield* this.parseStylePropertyParts(attrValue.text, attrValue.start)
			}
		}

		// For `Lupos.js`, completion `:class.|name|`
		else if (this.isScriptSyntax() && name.startsWith(':class.')) {
			yield new Part(PartType.Class, attrName.text.slice(7), attrName.start + 7)
		}

		// For normal class attribute, or for `JSX`, `Lupos.js`, `Vue.js`
		else if (name === 'class' || name === 'className' || name === ':class') {
			if (attrValue) {
				let value = attrValue.text

				// Probably expression.
				if (this.isScriptSyntax() && mayBeExpression(value)) {
					for (let word of Picker.pickWordsFromExpression(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}

					yield* this.parseReactModulePart(attrValue)
				}
				else {
					for (let word of Picker.pickWords(value)) {
						yield new Part(PartType.Class, word.text, attrValue.start + word.start)
					}
				}

				// Also provide completions for `class="|"`, or `class="abc |"`, or `class="abc | def"`.
				for (let word of Picker.pickPotentialEmptyWords(value)) {
					yield new Part(PartType.ClassPotential, word.text, attrValue.start + word.start)
				}
			}
		}

		// https://github.com/gajus/babel-plugin-react-css-modules and issue #60.
		// import 'xx.css'
		// `styleName="class-name"`
		else if (this.isScriptSyntax() && name === 'styleName') {
			if (attrValue) {
				yield new Part(PartType.ReactDefaultImportedCSSModuleClass, attrValue.text, attrValue.start).removeQuotes()
			}
		}
	}

	/** For import path, only for CSS imports. */
	protected *parseImportPart(node: HTMLTokenNode): Iterable<Part> {
		if (node.tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				let href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.CSSImportPath, href.text, href.start).removeQuotes()
				}
			}
		}

		// Vue.js only.
		else if (node.tagName === 'style') {
			let src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.CSSImportPath, src.text, src.start).removeQuotes()
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
			/^\s*\{\s*(?<moduleName>\w+)(?:\.(?<propertyName1>\w+)|\[\s*['"`](?<propertyName2>\w+)['"`]\s*\])\s*\}\s*$/
		)

		if (match) {
			yield new Part(PartType.ReactImportedCSSModuleName, match.moduleName.text, match.moduleName.start + start)

			let propertyName = match.propertyName1 ?? match.propertyName2
			yield new Part(PartType.ReactImportedCSSModuleProperty, propertyName.text, propertyName.start + start)
		}
	}

	/** Parse script tag for parts. */
	protected *parseScriptPart(node: HTMLTokenNode): Iterable<Part> {
		let textNode = node.firstTextNode

		// Not process embedded js within embedded html.
		if (textNode && textNode.token.text && this.languageId === 'html') {
			let jsTree = JSTokenTree.fromString(textNode.token.text, textNode.token.start, 'js')
			yield* jsTree.walkParts()
		}
	}

	/** Parse style tag for parts. */
	protected *parseStylePart(node: HTMLTokenNode): Iterable<Part> {
		let textNode = node.firstTextNode
		if (textNode) {
			let languageId = node.getAttributeValue('lang') ?? 'css'
			yield* this.parseStyleTextParts(textNode.token.text, textNode.token.start, languageId as CSSLanguageId)
		}
	}

	/** Parse style content for parts. */
	protected *parseStyleTextParts(text: string, start: number, languageId: CSSLanguageId): Iterable<Part> {
		let cssTree = CSSTokenTree.fromString(text, start, languageId)
		yield* cssTree.walkParts()
	}

	/** Parse style property content for parts. */
	protected *parseStylePropertyParts(text: string, start: number): Iterable<Part> {
		let matches = Picker.locateAllMatches(text, /([\w-]+)\s*:\s*(.+?)\s*(?:[;'"]|$)/g)

		for (let match of matches) {
			let name = match[1]
			let value = match[2]
		
			yield* CSSTokenTree.parsePropertyNamePart(name.text, name.start + start, undefined, value.text)
			yield* CSSTokenTree.parsePropertyValuePart(value.text, value.start + start)
		}
	}
}