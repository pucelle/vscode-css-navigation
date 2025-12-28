import {HTMLToken, HTMLTokenScanner, HTMLTokenType, CSSClassInExpressionTokenScanner, CSSClassInExpressionTokenType} from '../scanners'
import {Part, PartType} from '../parts'
import {hasQuotes, isExpressionLike, removeQuotesFromToken} from './utils'
import {Picked, Picker} from './picker'
import {CSSTokenTree} from './css-tree'
import {HTMLTokenNode} from './html-node'
import {JSTokenTree} from './js-tree'
import {LanguageIds} from '../language-ids'


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
	static fromString(string: string, scannerStart: number = 0, languageId: HTMLLanguageId = 'html', classNameRegExp: RegExp | null): HTMLTokenTree {
		let tokens = new HTMLTokenScanner(string, scannerStart, languageId).parseToTokens()
		return HTMLTokenTree.fromTokens(tokens, languageId, classNameRegExp)
	}

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>, languageId: HTMLLanguageId = 'html', classNameRegExp: RegExp | null): HTMLTokenTree {
		let tree = new HTMLTokenTree(languageId, classNameRegExp)
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
	readonly classNameRegExp: RegExp | null

	constructor(languageId: HTMLLanguageId, classNameRegExp: RegExp | null) {
		super({
			type: HTMLTokenType.StartTagName,
			text: 'root',
			start: -1,
			end: -1,
		}, null)

		this.languageId = languageId
		this.classNameRegExp = classNameRegExp
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.parseNodeParts(node)
		}
	}

	/** Parse node and attributes. */
	protected *parseNodeParts(node: HTMLTokenNode): Iterable<Part> {
		if (node.token.type === HTMLTokenType.StartTagName) {
			let partType = /^[A-Z]/.test(node.token.text) ? PartType.ComponentTag : PartType.Tag
			yield new Part(partType, node.token.text, node.token.start, node.tagLikeEnd)

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
		let unQuotedAttrValue = attrValue ? removeQuotesFromToken(attrValue) : null

		if (name === 'id') {
			if (unQuotedAttrValue) {
				yield new Part(PartType.Id, unQuotedAttrValue.text, unQuotedAttrValue.start)
			}
		}

		else if (name === 'style') {
			if (unQuotedAttrValue) {
				yield* this.parseStylePropertyParts(unQuotedAttrValue.text, unQuotedAttrValue.start)
			}
		}

		// For `lupos.html`, complete `:class.|name|` with class names.
		else if (LanguageIds.isScriptSyntax(this.languageId) && name.startsWith(':class.')) {
			yield new Part(PartType.Class, attrName.text.slice(7), attrName.start + 7)
		}

		// For `lupos.html`, complete `:style.-` with CSS Variables.
		else if (LanguageIds.isScriptSyntax(this.languageId) && name.startsWith(':style.-')) {
			yield new Part(PartType.CSSVariableAssignment, attrName.text.slice(7), attrName.start + 7)
		}

		// For normal class attribute, or for `JSX`, `lupos.html`, `Vue.js`,
		// or for `:class`, `v-bind:class`, `x-bind:class`
		else if (name === 'class' || name === 'className' || name === ':class' || name.endsWith('-bind:class')) {
			if (attrValue) {

				// Probably expression, and within template interpolation `${...}` or `{...}`.
				// `className={expression}` for React like.
				// `x-bind:class="expression"` for Alpine.js.
				// `:class="expression"` always contain expression in vue.
				// `class={...}` for Solid.js.
				// Exclude template literal `class="${...}"`

				// Which supports `"{className: boolean}"` syntax.
				let alreadyAnExpression = name.endsWith('-bind:class')
					|| this.languageId === 'vue' && name === ':class'

				let text = attrValue.text
				let start = attrValue.start

				if (alreadyAnExpression && hasQuotes(text)) {
					text = unQuotedAttrValue!.text
					start = unQuotedAttrValue!.start
				}

				let scanner = new CSSClassInExpressionTokenScanner(text, start, this.languageId, alreadyAnExpression)
				for (let token of scanner.parseToTokens()) {
					if (token.type === CSSClassInExpressionTokenType.ClassName) {
						yield new Part(PartType.Class, token.text, token.start)
					}
					else if (token.type === CSSClassInExpressionTokenType.PotentialClassName) {
						yield new Part(PartType.ClassPotential, token.text, token.start)
					}
					else if (token.type === CSSClassInExpressionTokenType.ReactModuleName) {
						yield new Part(PartType.ReactImportedCSSModuleName, token.text, token.start)
					}
					else if (token.type === CSSClassInExpressionTokenType.ReactModuleProperty) {
						yield new Part(PartType.ReactImportedCSSModuleProperty, token.text, token.start)
					}
				}
			}
		}

		// https://github.com/gajus/babel-plugin-react-css-modules and issue #60.
		// import 'xx.css'
		// `styleName="class-name"`
		else if (LanguageIds.isScriptSyntax(this.languageId) && name === 'styleName') {
			if (unQuotedAttrValue) {
				yield new Part(PartType.ReactDefaultImportedCSSModuleClass, unQuotedAttrValue.text, unQuotedAttrValue.start)
			}
		}

		// 
		// `var xxxClassNameXXX = `
		else if (attrValue && isExpressionLike(attrValue.text)) {
			if (this.classNameRegExp) {
				let matches = Picker.locateAllMatches(
					attrValue.text,
					this.classNameRegExp,
					[1, 2]
				)
	
				for (let match of matches as  Iterable<Record<1 | 2, Picked>>) {
					let subMatch = match[1] ?? match[2]
					if (subMatch) {
						yield new Part(PartType.Class, subMatch.text, subMatch.start + attrValue.start).trim()
					}
				}
			}
		}
	}

	/** For import path, only for CSS imports. */
	protected *parseImportPart(node: HTMLTokenNode): Iterable<Part> {
		if (node.tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				let href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.CSSImportPath, href.text, href.start)
				}
			}
		}

		// Vue.js only.
		else if (node.tagName === 'style') {
			let src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.CSSImportPath, src.text, src.start)
			}
		}
	}

	/** For react css module. */
	protected *parseReactModulePart(attrValue: HTMLToken): Iterable<Part> {
		let start = attrValue.start

		// `class={...}`.
		if (!/^\s*\{[\s\S]*?\}\s*$/.test(attrValue.text)) {
			return
		}

		// `style.className`.
		// `style['class-name']`.
		let matches = Picker.locateAllMatchGroups(
			attrValue.text,
			/(?<moduleName>\w+)(?:\.(?<propertyName1>\w+)|\[\s*['"`](?<propertyName2>\w[\w-]*)['"`]\s*\])/g
		)

		for (let match of matches) {
			yield new Part(PartType.ReactImportedCSSModuleName, match.moduleName.text, match.moduleName.start + start)

			let propertyName = match.propertyName1 ?? match.propertyName2
			yield new Part(PartType.ReactImportedCSSModuleProperty, propertyName.text, propertyName.start + start)
		}
	}

	/** Parse script tag for parts. */
	protected *parseScriptPart(node: HTMLTokenNode): Iterable<Part> {
		let textNode = node.firstTextNode

		// Not process embedded js within embedded html.
		if (textNode && textNode.token.text && LanguageIds.isHTMLSyntax(this.languageId)) {
			let jsTree = JSTokenTree.fromString(textNode.token.text, textNode.token.start, 'js', this.classNameRegExp)
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
		let matches = Picker.locateAllMatches(text, /([\w-]+)\s*:\s*(.+?)\s*(?:;|$)/g, [1, 2])

		for (let match of matches) {
			let name = match[1]
			let value = match[2]
		
			yield* CSSTokenTree.parsePropertyNamePart(name.text, name.start + start, undefined, value.text)
			yield* CSSTokenTree.parsePropertyValuePart(value.text, value.start + start)
		}
	}
}