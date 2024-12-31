import {CSSSelectorTokenScanner, CSSToken, CSSTokenScanner, CSSTokenType, SassIndentedTokenScanner} from '../scanners'
import {CSSTokenNode, CSSTokenNodeType} from './css-node'
import {Part, PartType} from './part'
import {CSSSelectorPart} from './part-css-selector'
import {Picker} from './picker'
import {joinTokens, ListMap} from './utils'


export class CSSTokenTree extends CSSTokenNode {

	/** Make a CSS token tree by tokens. */
	static fromTokens(tokens: Iterable<CSSToken>, string: string, languageId: CSSLanguageId): CSSTokenTree {
		let tree = new CSSTokenTree(string, languageId !== 'css')
		let current: CSSTokenNode = tree
		let latestComment: CSSToken | null = null
		let latestTokens: CSSToken[] = []


		function makeCommandOrSelector() {
			let joint = joinTokens(latestTokens, string)

			if (isCommandToken(joint)) {
				current.children!.push(new CSSTokenNode(CSSTokenNodeType.Command, joint, current))
			}
			else {
				let o = splitPropertyTokens(joint)
				if (o) {
					let [nameTokens, valueTokens] = o
					current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyName, nameTokens, current, latestComment))
					current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyValue, valueTokens, current))
				}
			}

			latestTokens = []
			latestComment = null
		}


		for (let token of tokens) {
			if (token.type === CSSTokenType.NotDetermined) {
				latestTokens.push(token)
			}
			else if (token.type === CSSTokenType.SassInterpolation) {
				latestTokens.push(token)
			}

			else if (token.type === CSSTokenType.SemiColon) {
				if (latestTokens.length > 0) {
					makeCommandOrSelector()
				}
			}

			else if (token.type === CSSTokenType.ClosureStart) {
				if (latestTokens.length > 0) {
					let joint = joinTokens(latestTokens, string)
					let type = isCommandToken(joint) ? CSSTokenNodeType.Command : CSSTokenNodeType.Selector
					let node: CSSTokenNode = new CSSTokenNode(type, joint, current, latestComment)

					node.closureStart = token.start
					current.children!.push(node)
					current = node

					latestTokens = []
					latestComment = null
				}
			}

			else if (token.type === CSSTokenType.ClosureEnd) {
				if (latestTokens.length > 0) {
					makeCommandOrSelector()
				}

				current.closureEnd = token.end
				current = current.parent ?? tree
			}

			else if (token.type === CSSTokenType.CommentText) {
				if (latestTokens.length === 0) {
					latestComment = token
				}
			}
		}

		return tree
	}

	/** Make a CSS token tree by string. */
	static fromString(string: string, languageId: CSSLanguageId): CSSTokenTree {
		let tokens: Iterable<CSSToken>

		if (languageId === 'sass') {
			tokens = new SassIndentedTokenScanner(string).parseToTokens()
		}
		else {
			tokens = new CSSTokenScanner(string, languageId !== 'css').parseToTokens()
		}

		return CSSTokenTree.fromTokens(tokens, string, languageId)
	}

	/** Make a partial CSS token tree by string and offset. */
	static fromStringAtOffset(string: string, offset: number, languageId: CSSLanguageId): CSSTokenTree {
		let tokens: Iterable<CSSToken>
		
		if (languageId === 'sass') {
			tokens = new SassIndentedTokenScanner(string).parsePartialTokens(offset)
		}
		else {
			tokens = new CSSTokenScanner(string, languageId !== 'css').parsePartialTokens(offset)
		}

		return CSSTokenTree.fromTokens(tokens, string, languageId)
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

	/** Quickly find a part at specified offset. */
	findPart(offset: number): Part | undefined {
		let walking = this.filterWalk((node: CSSTokenNode) => {
			return node.token.start >= offset && node.closureLikeEnd <= offset
		})

		for (let node of walking) {
			if (node.token.start > offset || node.token.end < offset) {
				continue
			}

			for (let part of this.parseNodePart(node)) {
				if (part.start >= offset && part.end <= offset) {
					return part
				}
			}
		}

		return undefined
	}

	/** Walk all the parts. */
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
			yield* this.parsePropertyNamePart(node)
		}
		else if (node.type === CSSTokenNodeType.PropertyValue) {
			yield* this.parsePropertyValuePart(node)
		}
		else if (node.type === CSSTokenNodeType.Command) {
			yield* this.parseCommandPart(node)
		}
	}

	/** Parse a selector string to parts. */
	private *parseSelectorPart(node: CSSTokenNode): Iterable<Part> {
		let groups = new CSSSelectorTokenScanner(node.token.text, node.token.start, this.isSassSyntax).parseToSeparatedTokens()
		let parentParts = this.nodePartMap.get(node.parent!)
		let commandWrapped = node.parent ? !!this.commandWrappedMap.get(node.parent) : false

		for (let group of groups) {
			let joint = joinTokens(group, this.string)

			let part = new CSSSelectorPart(
				group,
				joint,
				parentParts,
				commandWrapped,
				node.closureStart,
				node.closureEnd,
				node.commentToken?.text
			)

			yield part
			this.nodePartMap.add(node, part)
		}

		// Broadcast wrapped to children.
		this.commandWrappedMap.set(node, commandWrapped)
	}
	
	/** For property name part. */
	private *parsePropertyNamePart(node: CSSTokenNode): Iterable<Part> {
		if (node.token.text.startsWith('--')) {
			yield new Part(PartType.CSSVariableDeclaration, node.token.text, node.token.start)
		}
	}

	/** For property value part. */
	private *parsePropertyValuePart(node: CSSTokenNode): Iterable<Part> {
		let matches = Picker.locateAllMatchGroups(node.token.text, /var\(\s*--([\w-]+)\s*\)/g)

		for (let match of matches) {
			yield new Part(PartType.CSSVariableReference, match[1].text, match[1].start + node.token.start)
		}
	}
	
	/** Parse a command string to parts. */
	private *parseCommandPart(node: CSSTokenNode): Iterable<Part> {
		let commandName = node.token.text.match(/@([\w-]+)/)?.[1]

		// See `https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting/Nesting_at-rules`
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
			let match = Picker.locateMatchGroups(
				node.token.text,
				/@import\s+['"](.+?)['"]/
			)

			if (match) {
				yield new Part(PartType.CSSImportPath, match[1].text, match[1].start + node.token.start)
			}
		}

		this.commandWrappedMap.set(node, true)
	}
}



function isCommandToken(token: CSSToken): boolean {
	return token.text[0] === '@'
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
