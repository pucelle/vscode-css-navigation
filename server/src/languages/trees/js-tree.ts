import {JSToken, JSTokenScanner, JSTokenType, CSSSelectorTokenScanner, CSSSelectorTokenType, WhiteListHTMLTokenScanner} from '../scanners'
import {Part, PartType} from '../parts'
import {Picked, Picker} from './picker'
import {isCSSLikePath} from '../../utils'
import {CSSTokenTree} from './css-tree'
import {JSTokenNode} from './js-node'
import {HTMLTokenTree} from './html-tree'
import {LanguageIds} from '../language-ids'


export class JSTokenTree extends JSTokenNode {

	/** Make a HTML token tree by string. */
	static fromString(string: string, scannerStart: number = 0, languageId: HTMLLanguageId = 'js', classNameRegExp: RegExp | null): JSTokenTree {
		let tokens = new JSTokenScanner(string, scannerStart, languageId).parseToTokens()
		return JSTokenTree.fromTokens(tokens, languageId, classNameRegExp)
	}

	/** Make a token tree by tokens. */
	static fromTokens(tokens: Iterable<JSToken>, languageId: HTMLLanguageId = 'js', classNameRegExp: RegExp | null): JSTokenTree {
		let tree = new JSTokenTree(languageId, classNameRegExp)

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
	readonly classNameRegExp: RegExp | null

	constructor(languageId: HTMLLanguageId, classNameRegExp: RegExp | null) {
		super({
			type: JSTokenType.Script,
			text: '',
			start: -1,
			end: -1,
		}, null)

		this.languageId = languageId
		this.classNameRegExp = classNameRegExp
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
		let htmlTree = HTMLTokenTree.fromString(node.token.text, node.token.start, this.languageId, this.classNameRegExp)
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

		
		// `.classList.add('...')`
		matches = Picker.locateAllMatches(
			text,
			/\.classList\.add\s*\(\s*['"`]([\w-]*)['"`]/g,
			[1]
		)

		for (let match of matches) {
			yield new Part(PartType.Class, match[1].text, match[1].start + start).trim()
		}


		// `var xxxClassNameXXX = `
		if (this.classNameRegExp) {
			matches = Picker.locateAllMatches(
				text,
				this.classNameRegExp,
				[1, 2]
			)

			for (let match of matches as  Iterable<Record<1 | 2, Picked>>) {
				let subMatch = match[1] ?? match[2]
				if (subMatch) {
					yield new Part(PartType.Class, subMatch.text, subMatch.start + start).trim()
				}
			}
		}


		// `setProperty('--variable-name')`
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

		// Start a white list HTML tree.
		let tokens = new WhiteListHTMLTokenScanner(text, start, this.languageId).parseToTokens()
		let htmlTree = HTMLTokenTree.fromTokens(tokens, this.languageId, this.classNameRegExp)
		yield* htmlTree.walkParts()
	}
}