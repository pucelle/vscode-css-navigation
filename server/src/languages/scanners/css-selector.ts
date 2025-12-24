import {LanguageIds} from '../language-ids'
import {AnyTokenScanner} from './any'


// TODO:
// 1. When go to definition from HTML to CSS, detect HTML tag, class, attributes,
// and even ancestral tags as environment info to do CSS selector matching.
// Score CSS selectors by this matching, and try to sort them.
// Otherwise try to find HTML references by matching a selector with environment info.

// 2. Supports `:is()` and `:where()`.


/** Parsed CSS selector token. */
export interface CSSSelectorToken {
	type: CSSSelectorTokenType
	text: string
	start: number
	end: number
}


/** CSS token type. */
export enum CSSSelectorTokenType {

	/** Include `.` identifier. */
	Class,

	/** Include `#` identifier. */
	Id,
	
	Tag,
	AnyTag,

	/** `[...]` */
	Attribute,

	/** Like `&-sub`, must determine it by joining parent selector. */
	Nesting,

	// `+, >, ||, ~, |`
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
	WithinNesting,
	WithinClassName,
	WithinIdName,
	WithinAttribute,
	WithinPseudo,
	WithinPseudoElement,
	WithinCSSComment,
	WithinSassLessComment,
}


/** Match tag name. */
const IsName = /[\w&-]/g

/** Match escapable selector class or id name. */
const IsEscapableName = /[\w&-]|\\./g

function isName(char: string): boolean {
	IsName.lastIndex = 0
	return IsName.test(char)
}


/** For scanning css selector string. */
export class CSSSelectorTokenScanner extends AnyTokenScanner<CSSSelectorTokenType> {

	declare readonly languageId: CSSLanguageId
	declare protected state: ScanState
	private needToSeparate: boolean = false

	/** `.a, .b` -> `[.a, .b]`. */
	parseToSeparatedTokens(): CSSSelectorToken[][] {
		let tokens = this.parseToTokens()
		let groups: CSSSelectorToken[][] = []

		// Split by comma.
		for (let token of tokens) {
			if (token.type === CSSSelectorTokenType.Comma) {
				if (groups.length === 0 || groups[groups.length - 1].length > 0) {
					groups.push([])
				}
			}
			else {
				if (groups.length === 0) {
					groups.push([])
				}

				groups[groups.length - 1].push(token)
			}
		}

		return groups
	}

	/** 
	 * Parse to CSS selector tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(): Iterable<CSSSelectorToken> {
		while (this.state !== ScanState.EOF) {
			if (this.state === ScanState.AnyContent) {
				if (!this.readUntilToMatch(/[\w&.#\[:+>|~,\/*]/g)) {
					break
				}

				let char = this.peekChar()

				// `|&`
				if (char === '&') {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinNesting
				}

				// `|a`
				else if (isName(char)) {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinTag
				}

				// `|.a`
				else if (char === '.') {
					yield* this.makeSeparatorToken()

					// Move to `.|`
					this.offset += 1
					this.state = ScanState.WithinClassName
				}

				// `|#a`
				else if (char === '#' && this.peekChar(1) !== '{') {
					yield* this.makeSeparatorToken()

					// Move to `#|`
					this.offset += 1
					this.state = ScanState.WithinIdName
				}

				// `|*`
				else if (char === '*') {
					yield* this.makeSeparatorToken()

					// Move to `*|`
					this.offset += 1
					yield this.makeToken(CSSSelectorTokenType.AnyTag)
					this.state = ScanState.AnyContent
				}

				// `|[`
				else if (char === '[') {
					yield* this.makeSeparatorToken()
					this.state = ScanState.WithinAttribute
				}

				// `|::a`
				else if (char === ':' && this.peekChar(1) === ':') {
					yield* this.makeSeparatorToken()

					// Move to `::|`
					this.offset += 2
					this.state = ScanState.WithinPseudoElement
				}

				// `|:a`
				else if (char === ':') {
					yield* this.makeSeparatorToken()

					// Move to `:|`
					this.offset += 1
					this.state = ScanState.WithinPseudo
				}

				// Cursor before `||`
				else if (char === '|' && this.peekChar(1) === '|') {
					this.sync()
					this.needToSeparate = false

					// Move to after `|`
					this.offset += 2
					yield this.makeToken(CSSSelectorTokenType.Combinator)
					this.state = ScanState.AnyContent
				}

				// `|+`
				else if (char === '+' || char === '>' || char === '~' || char === '|') {
					this.sync()
					this.needToSeparate = false

					// Move to `+|`
					this.offset += 1
					yield this.makeToken(CSSSelectorTokenType.Combinator)
					this.state = ScanState.AnyContent
				}

				// `|,`
				else if (char === ',') {
					this.sync()
					this.needToSeparate = false

					// Move to `+|`
					this.offset += 1
					yield this.makeToken(CSSSelectorTokenType.Comma)
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
				else if (LanguageIds.isScssLessSyntax(this.languageId) && char === '/' && this.peekChar(1) === '/') {

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
				this.readUntilNot(IsName)
				yield this.makeToken(CSSSelectorTokenType.Tag)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinNesting) {

				// `&abc|`
				this.readUntilNot(IsEscapableName)
				yield this.makeToken(CSSSelectorTokenType.Nesting)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinClassName) {

				// `.abc|`
				this.readUntilNot(IsEscapableName)
				yield this.makeToken(CSSSelectorTokenType.Class)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinIdName) {

				// `#abc|`
				this.readUntilNot(IsEscapableName)
				yield this.makeToken(CSSSelectorTokenType.Id)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinAttribute) {

				// `[attr]|`
				if (!this.readBracketed()) {
					break
				}

				yield this.makeToken(CSSSelectorTokenType.Attribute)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinPseudo) {

				// `:hover|`
				this.readUntilNot(IsName)

				// `:has(...)|`
				if (this.peekChar() === '(') {
					if (!this.readBracketed()) {
						break
					}
				}
				
				yield this.makeToken(CSSSelectorTokenType.Pseudo)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinPseudoElement) {

				// `::before|`
				this.readUntilNot(IsName)

				// `::highlight(...)|`
				if (this.peekChar() === '(') {
					if (!this.readBracketed()) {
						break
					}
				}
				
				yield this.makeToken(CSSSelectorTokenType.PseudoElement)
				this.state = ScanState.AnyContent
				this.needToSeparate = true
			}

			else if (this.state === ScanState.WithinCSSComment) {

				// `|*/`
				if (!this.readUntilToMatch(/\*\//g)) {
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
				if (!this.readUntilToMatch(/\/\//g)) {
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