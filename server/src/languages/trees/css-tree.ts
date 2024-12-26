import {CSSToken, CSSTokenScanner, CSSTokenType} from '../scanners'
import {CSSTokenNode, CSSTokenNodeType} from './css-node'
import {Part, PartType} from './part'
import {Picker} from './picker'


export class CSSTokenTree extends CSSTokenNode {

	/** Make a CSS token tree by tokens. */
	static fromTokens(tokens: Iterable<CSSToken>, string: string): CSSTokenTree {
		let tree = new CSSTokenTree()
		let current: CSSTokenNode | null = tree
		let latestComment: CSSToken | null = null
		let latestTokens: CSSToken[] = []

		for (let token of tokens) {
			switch (token.type) {
				case CSSTokenType.NotDetermined:
				case CSSTokenType.SassInterpolation:
					latestTokens.push(token)
					break

				case CSSTokenType.SemiColon:
					if (latestTokens.length > 0) {
						let joint = joinTokens(latestTokens, string)

						if (isCommandTokens(joint)) {
							current.children!.push(new CSSTokenNode(CSSTokenNodeType.Command, joint, current))
						}
						else {
							let o = splitPropertyTokens(joint)
							if (o) {
								let [nameTokens, valueTokens] = o
								current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyName, nameTokens, current))
								current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyValue, valueTokens, current))
							}
						}

						latestTokens = []
						latestComment = null
					}
					break

				case CSSTokenType.ClosureStart:
					current.closureStart = token.start

					if (latestTokens.length > 0) {
						let joint = joinTokens(latestTokens, string)
						let type = isCommandTokens(joint) ? CSSTokenNodeType.Command : CSSTokenNodeType.Selector
						let node: CSSTokenNode = new CSSTokenNode(type, joint, current)
		
						node.commentToken = latestComment
						current.children!.push(node)
						current = node
						latestComment = null
					}
					break

				case CSSTokenType.ClosureEnd:
					current.closureEnd = token.end
					current = current.parent ?? tree
					break

				case CSSTokenType.CommentText:
					if (latestTokens.length === 0) {
						latestComment = token
					}
					break
			}

			if (!current) {
				break
			}
		}

		return tree
	}

	/** Make a CSS token tree by string. */
	static fromString(string: string, isSassSyntax: boolean = false): CSSTokenTree {
		let tokens = new CSSTokenScanner(string, isSassSyntax).parseToTokens()
		return CSSTokenTree.fromTokens(tokens, string)
	}

	/** Make a partial CSS token tree by string and offset. */
	static fromStringAtOffset(string: string, offset: number, isSassSyntax: boolean = false): CSSTokenTree {
		let tokens = new CSSTokenScanner(string, isSassSyntax).parsePartialTokens(offset)
		return CSSTokenTree.fromTokens(tokens, string)
	}

	constructor() {
		super(CSSTokenNodeType.Root, {
			type: CSSTokenType.NotDetermined,
			text: '',
			start: -1,
			end: -1,
		}, null)
	}

	/** Quickly find a part at specified offset. */
	findPart(offset: number): Part | undefined {
		let walking = this.filterWalk((node: CSSTokenNode) => {
			return node.token.start >= offset && node.closureLikeEnd <= offset
		})

		for (let node of walking) {
			if (node.token.end < offset) {
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

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.parseNodePart(node)
		}
	}

	private *parseNodePart(node: CSSTokenNode): Iterable<Part> {

		// Root node.
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
	}

	/** Parse a selector string to tokens. */
	private *parseSelectorPart(node: CSSTokenNode): Iterable<Part> {
		yield new Part(PartType.CSSSelector, node.token.text, node.token.start)
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
}



function isCommandTokens(token: CSSToken): boolean {
	return /^\s*@/.test(token.text)
}

function joinTokens(tokens: CSSToken[], string: string): CSSToken {
	if (tokens.length === 1) {
		return tokens[0]
	}
	else {
		let type = tokens[0].type
		let start = tokens[0].start
		let end = tokens[tokens.length - 1].end
		let text = string.slice(start, end)

		return {
			type,
			text,
			start,
			end,
		}
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
