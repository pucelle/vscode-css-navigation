import {HTMLToken, HTMLTokenScanner, HTMLTokenType, CSSClassInExpressionTokenScanner, CSSClassInExpressionTokenType, WhiteListHTMLTokenScanner} from '../scanners'
import {Part, PartType} from '../parts'
import {hasQuotes, isExpressionLike, removeQuotesFromToken} from './utils'
import {Picker} from './picker'
import {CSSTokenTree} from './css-tree'
import {HTMLTokenNode} from './html-node'
import {JSTokenTree} from './js-tree'
import {LanguageIds} from '../language-ids'
import {ClassNamesInJS} from '../class-names-in-js'


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
		const tokens = new HTMLTokenScanner(string, scannerStart, languageId).parseToTokens()
		return HTMLTokenTree.fromTokens(tokens, languageId)
	}

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<HTMLToken>, languageId: HTMLLanguageId = 'html'): HTMLTokenTree {
		const tree = new HTMLTokenTree(languageId)
		let current: HTMLTokenNode = tree
		let currentAttr: {name: HTMLToken, value: HTMLToken | null} | null = null

		for (const token of tokens) {
			if (token.type === HTMLTokenType.StartTagName) {
				const tagNode: HTMLTokenNode = new HTMLTokenNode(token, current)
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
				const textNode = new HTMLTokenNode(token, current)
				current.children!.push(textNode)
			}

			else if (token.type === HTMLTokenType.CommentText) {
				const commentNode = new HTMLTokenNode(token, current)
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

	*walkParts(): Iterable<Part> {
		for (const node of this.walk()) {
			yield* this.parseNodeParts(node)
		}
	}

	/** Parse node and attributes. */
	protected *parseNodeParts(node: HTMLTokenNode): Iterable<Part> {
		if (node.token.type === HTMLTokenType.StartTagName) {
			const partType = /^[A-Z]/.test(node.token.text) ? PartType.ComponentTag : PartType.Tag
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
		for (const attr of node.attrs!) {
			yield* this.parseAttrPart(attr.name, attr.value)
		}

		yield* this.parseImportPart(node)
	}

	/** For attribute part. */
	protected *parseAttrPart(attrName: HTMLToken, attrValue: HTMLToken | null): Iterable<Part> {
		const name = attrName.text
		const unQuotedAttrValue = attrValue ? removeQuotesFromToken(attrValue) : null

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
				const alreadyAnExpression = name.endsWith('-bind:class')
					|| this.languageId === 'vue' && name === ':class'

				let text = attrValue.text
				let start = attrValue.start

				if (alreadyAnExpression && hasQuotes(text)) {
					text = unQuotedAttrValue!.text
					start = unQuotedAttrValue!.start
				}

				yield* this.parseExpressionLike(text, start, alreadyAnExpression)
			}
		}

		// onClick={() => ...}
		// onClick=${() => ...}
		else if (attrValue && name.startsWith('on') && isExpressionLike(attrValue.text)) {

			// Start a white list HTML tree to parse for React Elements.
			const tokens = new WhiteListHTMLTokenScanner(attrValue.text, attrValue.start, this.languageId).parseToTokens()
			const htmlTree = HTMLTokenTree.fromTokens(tokens, this.languageId)
			yield* htmlTree.walkParts()
		}

		// https://github.com/gajus/babel-plugin-react-css-modules and issue #60.
		// import 'xx.css'
		// `styleName="class-name"`
		else if (LanguageIds.isScriptSyntax(this.languageId) && name === 'styleName') {
			if (unQuotedAttrValue) {
				yield new Part(PartType.ReactDefaultImportedCSSModuleClass, unQuotedAttrValue.text, unQuotedAttrValue.start)
			}
		}

		// `var xxxClassNameXXX = `
		else if (attrValue && isExpressionLike(attrValue.text)) {
			for (const part of ClassNamesInJS.walkParts(attrValue.text, attrValue.start)) {
				yield part
			}
		}

		// `.enterClassName="..."`
		else if (name
			&& attrValue
			&& name.startsWith('.')
			&& ClassNamesInJS.isWildName(name.slice(1))
		) {
			yield (new Part(PartType.Class, attrValue.text, attrValue.start)).unquote().trim()
		}
	}

	/** Parse expression like. */
	protected *parseExpressionLike(text: string, start: number, alreadyAnExpression: boolean): Iterable<Part> {
		const scanner = new CSSClassInExpressionTokenScanner(text, start, this.languageId, alreadyAnExpression)
		for (const token of scanner.parseToTokens()) {
			if (token.type === CSSClassInExpressionTokenType.ClassName) {
				yield new Part(PartType.Class, token.text, token.start)
			}
			else if (token.type === CSSClassInExpressionTokenType.PotentialClassName) {
				yield new Part(PartType.ClassPotential, token.text, token.start)
			}
			else if (token.type === CSSClassInExpressionTokenType.ReactModuleName) {
				yield new Part(PartType.ImportedCSSModuleName, token.text, token.start)
			}
			else if (token.type === CSSClassInExpressionTokenType.ReactModuleProperty) {
				yield new Part(PartType.ImportedCSSModuleProperty, token.text, token.start)
			}
		}
	}

	/** For import path, only for CSS imports. */
	protected *parseImportPart(node: HTMLTokenNode): Iterable<Part> {
		if (node.tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				const href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.CSSImportPath, href.text, href.start)
				}
			}
		}

		// Vue.js only.
		else if (node.tagName === 'style') {
			const src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.CSSImportPath, src.text, src.start)
			}
		}
	}

	/** For react css module. */
	protected *parseReactModulePart(attrValue: HTMLToken): Iterable<Part> {
		const start = attrValue.start

		// `class={...}`.
		if (!/^\s*\{[\s\S]*?\}\s*$/.test(attrValue.text)) {
			return
		}

		// `style.className`.
		// `style['class-name']`.
		const matches = Picker.locateAllMatchGroups(
			attrValue.text,
			/(?<moduleName>\w+)(?:\.(?<propertyName1>\w+)|\[\s*['"`](?<propertyName2>\w[\w-]*)['"`]\s*\])/g
		)

		for (const match of matches) {
			yield new Part(PartType.ImportedCSSModuleName, match.moduleName.text, match.moduleName.start + start)

			const propertyName = match.propertyName1 ?? match.propertyName2
			yield new Part(PartType.ImportedCSSModuleProperty, propertyName.text, propertyName.start + start)
		}
	}

	/** Parse script tag for parts. */
	protected *parseScriptPart(node: HTMLTokenNode): Iterable<Part> {
		const textNode = node.firstTextNode

		// Not process embedded js within embedded html.
		if (textNode && textNode.token.text && LanguageIds.isHTMLSyntax(this.languageId)) {
			const jsTree = JSTokenTree.fromString(textNode.token.text, textNode.token.start, 'js')
			yield* jsTree.walkParts()
		}
	}

	/** Parse style tag for parts. */
	protected *parseStylePart(node: HTMLTokenNode): Iterable<Part> {
		const textNode = node.firstTextNode
		if (textNode) {
			const languageId = node.getAttributeValue('lang') ?? 'css'
			yield* this.parseStyleTextParts(textNode.token.text, textNode.token.start, languageId as CSSLanguageId)
		}
	}

	/** Parse style content for parts. */
	protected *parseStyleTextParts(text: string, start: number, languageId: CSSLanguageId): Iterable<Part> {
		const cssTree = CSSTokenTree.fromString(text, start, languageId)
		yield* cssTree.walkParts()
	}

	/** Parse style property content for parts. */
	protected *parseStylePropertyParts(text: string, start: number): Iterable<Part> {
		const matches = Picker.locateAllMatches(text, /([\w-]+)\s*:\s*(.+?)\s*(?:;|$)/g, [1, 2])

		for (const match of matches) {
			const name = match[1]
			const value = match[2]
		
			yield* CSSTokenTree.parsePropertyNamePart(name.text, name.start + start, undefined, value.text)
			yield* CSSTokenTree.parsePropertyValuePart(value.text, value.start + start)
		}
	}
}