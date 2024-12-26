import {AnyTokenScanner} from './any'


/** Parsed CSS selector token. */
export interface CSSSelectorToken {
	type: CSSSelectorTokenType
	text: string
	start: number
	end: number
}

/** 
 * Analyze for each part of a selector, full name and main names.
 *   - full: `.a .b.c:hover`
 *   - main: [`.b`, `.c`]
 */
export interface CSSSelectorNameToken {
    full: CSSSelectorToken[]
    main: CSSSelectorToken[]
}


/** CSS token type. */
export enum CSSSelectorTokenType {

	ClassName,
	IdName,
	Tag,
	AnyTag,

	/** `[...]` */
	Attribute,

	/** Like `&-sub`, must determine it by joining parent selector. */
	Nested,

	// `+, >, ||, ~, |
	Combinator,

	// `' '`
	Separator,

	// `,`
	Comma,

	// `:hover`
	Pseudo,

	// `::before`
	PseudoElement,

	CommentText,
}

enum ScanState {
	EOF = 0,
	AnyContent = 1,
	WithinTag,
	WithinNested,
	WithinClassName,
	WithinIdName,
	WithinAttribute,
	WithinPseudo,
	WithinPseudoElement,
	WithinCSSComment,
	WithinSassLessComment,
}


/** Match selector name. */
const IsName = /[\w&-]/g

/** Match not selector name. */
const IsNotName = /[^\w&-]/g

function isName(char: string): boolean {
	IsName.lastIndex = 0
	return IsName.test(char)
}


/** For css selector. */
export class CSSSelectorTokenScanner extends AnyTokenScanner<CSSSelectorTokenType> {

	declare protected state: ScanState
	private isScssLessSyntax: boolean
	private needToSeparate: boolean = false

	constructor(string: string, isScssLessSyntax: boolean = false) {
		super(string)
		this.isScssLessSyntax = isScssLessSyntax
	}

	/**
	 * full: `.a .b.c:hover`
	 * main: [`.b`, `.c`]
	 */
	parseToSelectorNameTokens(): CSSSelectorNameToken[] {
		let tokens = this.parseToTokens()
		let groups: CSSSelectorToken[][] = [[]]

		// Split by comma.
		for (let token of tokens) {
			if (token.type === CSSSelectorTokenType.Comma) {
				if (groups[groups.length - 1].length > 0) {
					groups.push([])
				}
			}
			else {
				groups[groups.length - 1].push(token)
			}
		}

		return groups.map(g => {
			return {
				full: g,
				main: this.parseMainOfEachTokenGroup(g)
			}
		})
	}

	/**
	 * `a b` -> `b`
	 * `a + b` -> `b`
	 * `a:hover` -> `a`
	 * `.a.b` -> `[.a, .b]`
	 * `.a::before` -> `[]`
	 */
	private parseMainOfEachTokenGroup(group: CSSSelectorToken[]): CSSSelectorToken[] {
		let lastCombinatorIndex = group.findLastIndex(item => {
			return item.type === CSSSelectorTokenType.Combinator
				|| item.type === CSSSelectorTokenType.Separator
		})
		
		if (lastCombinatorIndex !== -1) {
			group = group.slice(lastCombinatorIndex + 1)
		}

		group = group.filter(item => {
			return item.type !== CSSSelectorTokenType.Attribute
				&& item.type !== CSSSelectorTokenType.Pseudo
		})

		// When work as pseudo element, no main.
		if (group.find(item => item.type === CSSSelectorTokenType.PseudoElement)) {
			return []
		}

		return group
	}

	/** 
	 * Parse css string to tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(): Iterable<CSSSelectorToken> {

		while (this.offset < this.string.length) {
			if (this.state === ScanState.AnyContent) {
				if (!this.readUntil(/[\w&.#\[:+>|~,\/*]/g)) {
					break
				}

				let char = this.peekChar()

				// `|&`
				if (char === '&') {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinNested
				}

				// `|a`
				else if (isName(char)) {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinTag
				}

				// `|.`
				else if (char === '.') {
					yield* this.makeSeparatorToken()

					// Move to `.|`
					this.offset += 1
					this.sync()
					this.state = ScanState.WithinClassName
				}

				// `|#`
				else if (char === '#') {
					yield* this.makeSeparatorToken()

					// Move to `#|`
					this.offset += 1
					this.sync()
					this.state = ScanState.WithinClassName
				}

				// `|*`
				else if (char === '*') {
					yield* this.makeSeparatorToken()

					// Move to `*|`
					this.offset += 1
					this.makeToken(CSSSelectorTokenType.AnyTag)
					this.state = ScanState.AnyContent
				}

				// `|[`
				else if (char === '[') {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinAttribute
				}

				// `|::`
				else if (char === ':' && this.peekChar(1) === ':') {
					yield* this.makeSeparatorToken()

					// Move to `:|`
					this.offset += 2
					this.state = ScanState.WithinPseudo
				}

				// `|:`
				else if (char === ':') {
					yield* this.makeSeparatorToken()

					// Move to `:|`
					this.offset += 1
					this.state = ScanState.WithinPseudoElement
				}

				// Cursor before `||`
				else if (char === '|' && this.peekChar(1) === '|') {
					this.sync()
					this.needToSeparate = false

					// Move to after `|`
					this.offset += 2
					this.makeToken(CSSSelectorTokenType.Combinator)
					this.state = ScanState.AnyContent
				}

				// `|+`
				else if (char === '+' || char === '>' || char === '~' || char === '|') {
					this.sync()
					this.needToSeparate = false

					// Move to `+|`
					this.offset += 1
					this.makeToken(CSSSelectorTokenType.Combinator)
					this.state = ScanState.AnyContent
				}

				// `|,`
				else if (char === ',') {
					this.sync()
					this.needToSeparate = false

					// Move to `+|`
					this.offset += 1
					this.makeToken(CSSSelectorTokenType.Comma)
					this.state = ScanState.AnyContent
				}

				// `|/*`
				else if (char === '/' && this.peekChar(1) === '*') {

					// Move to `/*|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinCSSComment
				}

				// `|//`
				else if (this.isScssLessSyntax && char === '/' && this.peekChar(1) === '/') {

					// Move to `/*|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinSassLessComment
				}

				else {
					this.offset += 1
				}
			}

			else if (this.state === ScanState.WithinTag) {

				// `abc|`
				if (!this.readUntil(IsNotName)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.Tag)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinNested) {

				// `&abc|`
				if (!this.readUntil(IsNotName)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.Nested)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinClassName) {

				// `.abc|`
				if (!this.readOut(IsName)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.ClassName)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinIdName) {

				// `#abc|`
				if (!this.readUntil(IsNotName)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.IdName)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinAttribute) {

				// `[attr]|`
				if (!this.readExpressionLike()) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.Attribute)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinPseudo) {

				// `:hover|`
				this.readUntil(IsNotName)

				// `:has(...)|`
				if (this.peekChar() === '(') {
					if (!this.readExpressionLike()) {
						break
					}
				}
				
				yield this.makeToken(CSSSelectorTokenType.Pseudo)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinPseudoElement) {

				// `::before|`
				this.readUntil(IsNotName)

				// `::highlight(...)|`
				if (this.peekChar() === '(') {
					if (!this.readExpressionLike()) {
						break
					}
				}
				
				yield this.makeToken(CSSSelectorTokenType.PseudoElement)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinCSSComment) {

				// `|*/`
				if (!this.readUntil(/\*\//g)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.CommentText)

				// Move to `*/|`
				this.offset += 2
				this.sync()
				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinSassLessComment) {

				// `|//`
				if (!this.readUntil(/\/\//g)) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.CommentText)

				// Move to `//|`
				this.offset += 2
				this.sync()
				this.state = ScanState.AnyContent
			}
		}
	}

	private *makeSeparatorToken(): Iterable<CSSSelectorToken> {
		if (this.needToSeparate && this.offset > this.start) {
			yield this.makeToken(CSSSelectorTokenType.Separator)
			this.needToSeparate = false
		}
		else {
			this.sync()
		}
	}
}