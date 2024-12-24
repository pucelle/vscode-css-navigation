import {CSSToken, CSSTokenScanner, CSSTokenType} from './css'
import {Part, PartType} from './part'


/** CSS token type. */
export enum CSSTokenNodeType {
	Root,
	Command,
	Selector,
	Property,
	PropertyName,
	PropertyValue,
}


/** Build a simple tree by tokens. */
export class CSSTokenNode {

	readonly type: CSSTokenNodeType
	readonly tokens: CSSToken[]
	readonly parent: CSSTokenNode | null
	readonly children: CSSTokenNode[] | null

	constructor(type: CSSTokenNodeType, tokens: CSSToken[], parent: CSSTokenNode | null) {
		this.type = type
		this.tokens = tokens
		this.parent = parent

		if (type === CSSTokenNodeType.Command || type === CSSTokenNodeType.Selector) {
			this.children = []
		}
		else {
			this.children = null
		}
	}
	
	*walk(): Iterable<CSSTokenNode> {
		yield this

		if (this.children) {
			for (let child of this.children!) {
				yield* child.walk()
			}
		}
	}
}


export class CSSTokenTree extends CSSTokenNode {

	/** Make a CSS token tree by tokens. */
	static fromTokens(tokens: Iterable<CSSToken>): CSSTokenTree {
		let tree = new CSSTokenTree()
		let current: CSSTokenNode | null = tree
		let rest: CSSToken[] = []

		for (let token of tokens) {
			switch (token.type) {
				case CSSTokenType.NotDetermined:
				case CSSTokenType.SassInterpolation:
					rest.push(token)
					break

				case CSSTokenType.SemiColon:
					if (rest.length > 0) {
						if (this.isCommandTokens(rest)) {
							current.children!.push(new CSSTokenNode(CSSTokenNodeType.Command, rest, current))
						}
						else {
							let [nameTokens, valueTokens] = this.splitPropertyTokens(rest)

							current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyName, nameTokens, current))
							current.children!.push(new CSSTokenNode(CSSTokenNodeType.PropertyValue, valueTokens, current))
						}
					}
					break

				case CSSTokenType.ClosureStart:
					let type = this.isCommandTokens(rest) ? CSSTokenNodeType.Command : CSSTokenNodeType.Selector
					let node: CSSTokenNode = new CSSTokenNode(type, rest, current)
	
					current.children!.push(node)
					current = node
					break

				case CSSTokenType.ClosureEnd:
					current = current.parent ?? tree
					break

				// Ignore comments. 
				case CSSTokenType.Comment:
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
		return CSSTokenTree.fromTokens(tokens)
	}

	/** Make a partial CSS token tree by string and offset. */
	static fromStringAtOffset(string: string, offset: number, isSassSyntax: boolean = false): CSSTokenTree {
		let tokens = new CSSTokenScanner(string, isSassSyntax).parsePartialTokens(offset)
		return CSSTokenTree.fromTokens(tokens)
	}

	static isCommandTokens(tokens: CSSToken[]): boolean {
		return tokens[0].text.trimLeft().startsWith('@')
	}

	static splitPropertyTokens(tokens: CSSToken[]): [CSSToken[], CSSToken[]] {
		let index = 0
		let textIndex = -1

		for (; index < tokens.length; index++) {
			let token = tokens[index]
			textIndex = token.text.indexOf(':')

			if (textIndex > -1) {
				break
			}
		}

		if (index < tokens.length) {
			let nameTokens = tokens.slice(0, index)
			nameTokens.push({
				type: CSSTokenType.NotDetermined,
				text: tokens[index].text.slice(0, textIndex),
				start: tokens[index].start,
				end: tokens[index].start + index,
			})

			let valueTokens = tokens.slice(index)
			valueTokens[0].text = valueTokens[0].text.slice(textIndex)
			valueTokens[0].start += textIndex

			return [nameTokens, valueTokens]
		}

		return [tokens, []]
	}

	constructor() {
		super(CSSTokenNodeType.Root, [], null)
	}

	*walkParts(): Iterable<Part> {
		for (let node of this.walk()) {
			yield* this.walkNodePart(node)
		}
	}

	protected *walkNodePart(node: CSSTokenNode): Iterable<Part> {

		// Root node.
		if (node.token.start === -1) {
			return
		}

		if (node.token.type === CSSTokenType.StartTagName) {
			yield new Part(PartType.Tag, node.token.text, node.token.start)

			for (let attr of node.attrs!) {
				if (!attr.value) {
					continue
				}

				yield* this.walkAttrPart(attr.name, attr.value)
			}

			yield* this.walkImport(node)
		}
	}

	/** For attribute part. */
	protected *walkAttrPart(attrName: CSSToken, attrValue: CSSToken): Iterable<Part> {
		let name = attrName.text

		if (name === 'id') {
			yield new Part(PartType.Id, attrValue.text, attrValue.start)
		}
		else if (name === 'class') {
			yield new Part(PartType.Class, attrValue.text, attrValue.start)
		}

		// For `JSX`
		else if (name === 'className') {
			yield new Part(PartType.Class, attrValue.text, attrValue.start)
		}

		// For `Lupos.js`, `Vue.js`
		else if (name === ':class') {
			yield new Part(PartType.ClassBinding, attrValue.text, attrValue.start)
		}

		// For `Lupos.js`, completion `:class.|name|`
		else if (name.startsWith(':class.')) {
			yield new Part(PartType.ClassBinding, attrName.text.slice(7), attrName.start + 7)
		}
	}

	/** For import path. */
	protected *walkImport(node: CSSTokenNode): Iterable<Part> {
		let tagName = node.token.text

		if (tagName === 'link') {
			if (node.getAttributeValue('rel') === 'stylesheet') {
				let href = node.getAttribute('href')
				if (href) {
					yield new Part(PartType.Import, href.text, href.start)
				}
			}
		}
		else if (tagName === 'style') {
			let src = node.getAttribute('src')
			if (src) {
				yield new Part(PartType.Import, src.text, src.start)
			}
		}
	}

	findPart(offset: number): Part | undefined {
		for (let node of this.walk()) {
			if (node.tagStart > offset) {
				break
			}

			if (node.tagEnd <= offset) {
				for (let part of this.walkNodePart(node)) {
					if (part.start >= offset && part.end <= offset) {
						return part
					}
				}
			}
		}

		return undefined
	}
}