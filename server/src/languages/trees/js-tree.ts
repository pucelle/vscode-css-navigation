import {JSToken, JSTokenScanner, JSTokenType, CSSSelectorTokenScanner, CSSSelectorTokenType, WhiteListHTMLTokenScanner} from '../scanners'
import {Part, PartType} from '../parts'
import {Picker} from './picker'
import {isCSSLikePath} from '../../utils'
import {CSSTokenTree} from './css-tree'
import {JSTokenNode} from './js-node'
import {HTMLTokenTree} from './html-tree'
import {LanguageIds} from '../language-ids'


const DOMElementNames = new Set([
	'a',
	'abbr',
	'address',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'base',
	'bdi',
	'bdo',
	'blockquote',
	'body',
	'br',
	'button',
	'canvas',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'data',
	'datalist',
	'dd',
	'del',
	'details',
	'dfn',
	'dialog',
	'div',
	'dl',
	'dt',
	'em',
	'embed',
	'fencedframe',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'head',
	'header',
	'hgroup',
	'hr',
	'html',
	'i',
	'iframe',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'link',
	'main',
	'map',
	'mark',
	'menu',
	'meta',
	'meter',
	'nav',
	'noscript',
	'object',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'picture',
	'portal',
	'pre',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'script',
	'search',
	'section',
	'select',
	'slot',
	'small',
	'source',
	'span',
	'strong',
	'style',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'template',
	'textarea',
	'tfoot',
	'th',
	'thead',
	'time',
	'title',
	'tr',
	'track',
	'u',
	'ul',
	'var',
	'video',
	'wbr'
])


export class JSTokenTree extends JSTokenNode{

	/** Make a HTML token tree by string. */
	static fromString(string: string, scannerStart: number = 0, languageId: HTMLLanguageId = 'js'): JSTokenTree {
		let tokens = new JSTokenScanner(string, scannerStart, languageId).parseToTokens()
		return JSTokenTree.fromTokens(tokens, languageId)
	}

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<JSToken>, languageId: HTMLLanguageId = 'js'): JSTokenTree {
		let tree = new JSTokenTree(languageId)

		for (let token of tokens) {
			if (token.type === JSTokenType.HTML
				|| token.type === JSTokenType.CSS
				|| token.type === JSTokenType.Script
			) {
				let tagNode: JSTokenNode = new JSTokenNode(token, tree)
				tree.children!.push(tagNode)
			}
		}

		return tree
	}


	declare children: JSTokenNode[]
	readonly languageId: HTMLLanguageId

	constructor(languageId: HTMLLanguageId) {
		super({
			type: JSTokenType.Script,
			text: '',
			start: -1,
			end: -1,
		}, null)

		this.languageId = languageId
		this.children = []
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.parseNodeParts(node)
		}
	}

	/** Parse node and attributes. */
	protected *parseNodeParts(node: JSTokenNode): Iterable<Part> {
		if (node.token.type === JSTokenType.HTML) {
			yield* this.parseHTMLParts(node)
		}
		else if (node.token.type === JSTokenType.CSS) {
			yield* this.parseCSSParts(node)
		}
		else if (node.token.type === JSTokenType.Script) {
			yield* this.sortParts(this.parseScriptParts(node))
		}
	}

	/** Parse html template part. */
	protected *parseHTMLParts(node: JSTokenNode): Iterable<Part> {

		// HTML tree accept current language, and it affects some actions.
		let htmlTree = HTMLTokenTree.fromString(node.token.text, node.token.start, this.languageId)
		yield* htmlTree.walkParts()
	}

	/** Parse css template part. */
	protected *parseCSSParts(node: JSTokenNode): Iterable<Part> {
		let cssTree = CSSTokenTree.fromString(node.token.text, node.token.start, 'css')
		yield* cssTree.walkParts()
	}

	/** Parse script text for parts. */
	protected *parseScriptParts(node: JSTokenNode): Iterable<Part> {
		let text = node.token.text
		let start = node.token.start

		// `querySelect('.class-name')`
	 	// `$('.class-name')`
		let matches = Picker.locateAllMatches(
			text,
			/(?:\$|\.querySelector|\.querySelectorAll)\s*\(\s*['"`](.*?)['"`]/g,
			[1]
		)

		for (let match of matches) {
			let selector = match[1].text
			let selectorStart = match[1].start + start
			let tokens = new CSSSelectorTokenScanner(selector, selectorStart, 'css').parseToTokens()

			for (let token of tokens) {
				if (token.type === CSSSelectorTokenType.Tag) {
					yield new Part(PartType.CSSSelectorQueryTag, token.text, token.start)
				}
				else if (token.type === CSSSelectorTokenType.Id) {
					yield new Part(PartType.CSSSelectorQueryId, token.text, token.start)
				}
				else if (token.type === CSSSelectorTokenType.Class) {
					yield new Part(PartType.CSSSelectorQueryClass, token.text, token.start)
				}
			}
		}


		// setProperty('--variable-name')
		matches = Picker.locateAllMatches(
			text,
			/\.setProperty\s*\(\s*['"`](-[\w-]*)['"`]/g,
			[1]
		)

		for (let match of matches) {
			yield new Part(PartType.CSSVariableAssignment, match[1].text, match[1].start + start).trim()
		}


		// `import * from '...'`
		// `import abc from '...'`
		// `import '...'`
		matches = Picker.locateAllMatches(
			text,
			/import\s+(?:\w+\s+from\s+)?['"`](.+?)['"`]/g,
			[1]
		)

		for (let match of matches) {
			let path = match[1].text

			if (isCSSLikePath(path)) {
				yield new Part(PartType.CSSImportPath, match[1].text, match[1].start + start).trim()
			}
		}


		// Parse react elements.
		if (LanguageIds.isReactScriptSyntax(this.languageId)) {
			yield* this.parseReactElementParts(node)
		}
	}

	/** Parse react elements. */
	protected *parseReactElementParts(node: JSTokenNode): Iterable<Part> {
		let text = node.token.text
		let start = node.token.start

		// It's very hard to detect react elements without parsing whole script.
		// Normally when parsing jsx or tsx, when meet `<` and expect an expression,
		// it recognizes as React Element.
		let re = /<\/?([\w-]+)\s*[\s\S]*?>/g
		let match: RegExpExecArray | null

		let startTags: Set<string> = new Set()
		let whiteList: Set<string> = new Set()

		while (match = re.exec(text)) {
			let tagName = match[1]
			let isCloseTag = match[0][1] === '/'
			let isSelfCloseTag = match[0][match[0].length - 2] === '/'

			if (DOMElementNames.has(tagName)) {
				whiteList.add(tagName)
			}
			else if (isCloseTag) {
				if (match[0][match[0].length - 2] === '/' || startTags.has(tagName)) {
					whiteList.add(tagName)
				}
			}
			else if (isSelfCloseTag) {
				whiteList.add(tagName)
			}
			else {
				startTags.add(tagName)
			}
		}

		// Start a white list HTML tree.
		let tokens = new WhiteListHTMLTokenScanner(text, start, this.languageId, whiteList).parseToTokens()
		let htmlTree = HTMLTokenTree.fromTokens(tokens, this.languageId)
		yield* htmlTree.walkParts()
	}
}