import {CSSSelectorTokenScanner, CSSToken, CSSTokenScanner, CSSTokenType, SassIndentedTokenScanner} from '../scanners'
import {CSSTokenNode, CSSTokenNodeType} from './css-node'
import {Part, PartType} from '../parts'
import {CSSSelectorPart} from '../parts'
import {Picker} from './picker'
import {joinTokens, ListMap} from './utils'


export class CSSTokenTree extends CSSTokenNode {

	/** Make a CSS token tree by tokens. */
	static fromTokens(tokens: Iterable<CSSToken>, string: string, languageId: CSSLanguageId): CSSTokenTree {
		let tree = new CSSTokenTree(string, languageId !== 'css')
		let current: CSSTokenNode = tree
		let latestComment: CSSToken | null = null
		let notDetermined: CSSToken[] = []

		function parseNotDetermined(mayBeSelector: boolean) {
			let joint = joinTokens(notDetermined, string)

			if (isCommandToken(joint)) {
				current.children!.push(new CSSTokenNode(CSSTokenNodeType.Command, joint, current))
			}

			// Especially when inputting like `a{b|}`.
			else if (mayBeSelector && !joint.text.includes(':')) {
				current.children!.push(new CSSTokenNode(CSSTokenNodeType.Selector, joint, current))
			}

			// Otherwise parse as property.
			else {
				let o = splitPropertyTokens(joint)
				if (o) {
					let [nameToken, valueToken] = o
					let nameNode = new CSSTokenNode(CSSTokenNodeType.PropertyName, nameToken, current, latestComment)
					let valueNode = new CSSTokenNode(CSSTokenNodeType.PropertyValue, valueToken, current)

					nameNode.defEnd = valueToken.end
					current.children!.push(nameNode, valueNode)
				}
			}

			notDetermined = []
			latestComment = null
		}


		for (let token of tokens) {
			if (token.type === CSSTokenType.NotDetermined) {
				notDetermined.push(token)
			}
			else if (token.type === CSSTokenType.SassInterpolation) {
				notDetermined.push(token)
			}

			else if (token.type === CSSTokenType.SemiColon) {
				if (notDetermined.length > 0) {
					parseNotDetermined(false)
				}
			}

			else if (token.type === CSSTokenType.ClosureStart) {
				if (notDetermined.length > 0) {
					let joint = joinTokens(notDetermined, string)
					let type = getSelectorLikeNodeType(joint, current)
					let node: CSSTokenNode = new CSSTokenNode(type, joint, current, latestComment)

					current.children!.push(node)
					current = node

					notDetermined = []
					latestComment = null
				}
			}

			else if (token.type === CSSTokenType.ClosureEnd) {
				if (notDetermined.length > 0) {
					parseNotDetermined(true)
				}

				current.defEnd = token.end
				current = current.parent ?? tree
			}

			else if (token.type === CSSTokenType.CommentText) {
				if (notDetermined.length === 0) {
					latestComment = token
				}
			}
		}

		// Although has no `{` followed, still parse it as selector.
		if (notDetermined.length > 0) {
			parseNotDetermined(true)
		}

		return tree
	}

	/** Make a CSS token tree by string. */
	static fromString(string: string, scannerStart: number, languageId: CSSLanguageId): CSSTokenTree {
		let tokens: Iterable<CSSToken>

		if (languageId === 'sass') {
			tokens = new SassIndentedTokenScanner(string, scannerStart).parseToTokens()
		}
		else {
			tokens = new CSSTokenScanner(string, scannerStart, languageId !== 'css').parseToTokens()
		}

		return CSSTokenTree.fromTokens(tokens, string, languageId)
	}

	/** For property name part. */
	static *parsePropertyNamePart(text: string, start: number): Iterable<Part> {
		if (text.startsWith('-')) {

			// Will not set defEnd to value end, because default vscode plugin will
			// also generate a definition, but end with property name end.
			yield new Part(PartType.CSSVariableDeclaration, text, start)
		}
	}

	/** For property value part. */
	static *parsePropertyValuePart(text: string, start: number): Iterable<Part> {
		let matches = Picker.locateAllMatches(text, /var\(\s*([\w-]*)\s*\)/g)

		for (let match of matches) {
			yield new Part(PartType.CSSVariableReference, match[1].text, match[1].start + start)
		}
	}


	readonly string: string
	readonly isSassSyntax: boolean
	private nodePartMap: ListMap<CSSTokenNode, CSSSelectorPart> = new ListMap()
	private commandWrappedMap: Map<CSSTokenNode, boolean> = new Map()

	constructor(string: string, isSassSyntax: boolean) {
		super(CSSTokenNodeType.Root, {
			type: CSSTokenType.NotDetermined,
			text: '',
			start: -1,
			end: -1,
		}, null)

		this.string = string
		this.isSassSyntax = isSassSyntax
	}

	/** 
	 * Walk all the parts.
	 * Note it ignores all non-primary selectors.
	 */
	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.parseNodePart(node)
		}
	}

	private *parseNodePart(node: CSSTokenNode): Iterable<Part> {
		if (node.isRoot) {
			return
		}

		if (node.type === CSSTokenNodeType.Selector) {
			yield* this.parseSelectorPart(node)
		}
		else if (node.type === CSSTokenNodeType.PropertyName) {
			yield* CSSTokenTree.parsePropertyNamePart(node.token.text, node.token.start)
		}
		else if (node.type === CSSTokenNodeType.PropertyValue) {
			yield* CSSTokenTree.parsePropertyValuePart(node.token.text, node.token.start)
		}
		else if (node.type === CSSTokenNodeType.Command) {
			yield* this.parseCommandPart(node)
		}
	}

	/** Parse a selector string to parts. */
	private *parseSelectorPart(node: CSSTokenNode): Iterable<Part> {
		yield* this.parseSelectorString(node.token.text, node.token.start, node, false)
	}

	/** Parse a selector content to parts. */
	private *parseSelectorString(text: string, start: number, node: CSSTokenNode, breaksSeparatorNesting: boolean): Iterable<Part> {
		let groups = new CSSSelectorTokenScanner(text, start, this.isSassSyntax).parseToSeparatedTokens()
		let parentParts = this.nodePartMap.get(node.parent!)
		let commandWrapped = node.parent ? !!this.commandWrappedMap.get(node.parent) : false

		for (let group of groups) {
			let joint = joinTokens(group, this.string)

			let part = CSSSelectorPart.parseFrom(
				joint,
				group,
				parentParts,
				breaksSeparatorNesting,
				node.defEnd,
				commandWrapped,
				node.commentToken?.text
			)

			yield part

			this.nodePartMap.add(node, part)
		}

		// Broadcast wrapped to children.
		this.commandWrappedMap.set(node, commandWrapped)
	}
	
	/** Parse a command string to parts. */
	private *parseCommandPart(node: CSSTokenNode): Iterable<Part> {
		let commandName = getCommandName(node.token.text)

		// See https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting/Nesting_at-rules
		if (commandName === 'media'
			|| commandName === 'supports'
			|| commandName === 'layer'
			|| commandName === 'scope'
			|| commandName === 'container'
		) {
			let parentParts = this.nodePartMap.get(node.parent!)
			if (parentParts) {
				this.nodePartMap.set(node, parentParts)
			}
		}

		if (commandName === 'import') {

			// `@import ''`.
			// `class={style['class-name']}`.
			let match = Picker.locateMatches(
				node.token.text,
				/@import\s+['"](.+?)['"]/
			)

			if (match) {
				yield new Part(PartType.CSSImportPath, match[1].text, match[1].start + node.token.start)
			}
		}

		else if (commandName === 'at-root') {

			// `@at-root .class`.
			let selectorMatch = Picker.locateMatches(
				node.token.text,
				/@at-root\s+(.+)/
			)

			if (selectorMatch) {
				yield* this.parseSelectorString(selectorMatch[1].text, selectorMatch[1].start + node.token.start, node, true)
			}
		}

		else if (commandName === 'keyframes') {
			yield new Part(PartType.CSSImportPath, node.token.text, node.token.start, node.defEnd).trim()
		}

		this.commandWrappedMap.set(node, true)
	}
}


function isCommandToken(token: CSSToken): boolean {
	return /^\s*@/.test(token.text)
}

function getCommandName(text: string): string | undefined {
	return text.match(/@([\w-]+)/)?.[1]
}

function getSelectorLikeNodeType(token: CSSToken, current: CSSTokenNode): CSSTokenNodeType {
	if (current.type === CSSTokenNodeType.Command && getCommandName(current.token.text) === 'keyframes') {
		return CSSTokenNodeType.ClosureName
	}
	else if (isCommandToken(token)) {
		return CSSTokenNodeType.Command
	}
	else {
		return CSSTokenNodeType.Selector
	}
}

function splitPropertyTokens(token: CSSToken): [CSSToken, CSSToken] | null {

	// Here ignores comments.
	let match = Picker.locateMatches(token.text, /([\w-]+)\s*:\s*(.+?)\s*$/)
	if (!match) {
		return null
	}

	let name: CSSToken = {
		type: CSSTokenType.NotDetermined,
		text: match[1].text,
		start: token.start + match[1].start,
		end: token.start + match[1].start + match[1].text.length,
	}

	let value: CSSToken = {
		type: CSSTokenType.NotDetermined,
		text: match[2].text,
		start: token.start + match[2].start,
		end: token.start + match[2].start + match[2].text.length,
	}
	
	return [name, value]
}
