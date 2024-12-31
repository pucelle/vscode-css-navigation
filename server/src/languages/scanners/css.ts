import {AnyTokenScanner} from './any'


/** Parsed CSS token. */
export interface CSSToken {
	type: CSSTokenType
	text: string
	start: number
	end: number
}


/** CSS token type. */
export enum CSSTokenType {

	/** 
	 * When first time doing scanning,
	 * can't determine whether a token is selector or property.
	 * Note it includes whitespaces at head and tail.
	 */
	NotDetermined,

	ClosureStart,
	ClosureEnd,
	SemiColon,
	CommentText,
	SassInterpolation,
}

enum ScanState {
	EOF = 0,
	AnyContent = 1,
	WithinSassInterpolation,
	WithinCSSComment,
	WithinScssLessComment,
}


/** For CSS Like languages. */
export class CSSTokenScanner extends AnyTokenScanner<CSSTokenType> {

	declare protected state: ScanState
	private isScssLessSyntax: boolean

	constructor(string: string, isSassSyntax: boolean = false) {
		super(string)
		this.isScssLessSyntax = isSassSyntax
	}

	*parsePartialTokens(offset: number): Iterable<CSSToken> {
		while (offset > 0) {
			let selectorEnd = this.backSearch(offset, ['{']) - 1
			if (selectorEnd < 0) {
				offset = 0
				break
			}

			let selectorStart = this.backSearch(selectorEnd, ['}', ';']) + 1
			if (selectorStart <= 0) {
				offset = 0
				break
			}

			offset = selectorStart

			let maySelector = this.string.slice(selectorStart, selectorEnd)
			if (!maySelector.includes('&')) {
				break
			}

			offset -= 2
		}

		for (let token of this.parseToTokens(offset)) {
			yield token

			if (token.end >= offset) {
				break
			}
		}
	}

	/** 
	 * Parse css string to tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(start: number = 0): Iterable<CSSToken> {
		this.start = this.offset = start

		while (this.offset < this.string.length) {
			if (this.state === ScanState.AnyContent) {

				// Skip white spaces.
				if (!this.readWhiteSpaces()) {
					break
				}

				this.sync()

				if (!this.readUntil(/[\/#{};"']/g)) {
					break
				}

				// `|#{`
				else if (this.isScssLessSyntax && this.peekChars(0, 2) === '#{') {
					yield* this.makeNotDeterminedToken()

					// Move to `#{|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinSassInterpolation
				}

				// `|{`
				else if (this.peekChar() === '{') {
					yield* this.makeNotDeterminedToken()

					// Move to `{|`
					this.offset += 1
					yield this.makeToken(CSSTokenType.ClosureStart)
					this.state = ScanState.AnyContent
				}

				// `|}`
				else if (this.peekChar() === '}') {
					yield* this.makeNotDeterminedToken()

					// Move to `}|`
					this.offset += 1
					yield this.makeToken(CSSTokenType.ClosureEnd)
					this.state = ScanState.AnyContent
				}

				// `|;`
				else if (this.peekChar() === ';') {
					yield* this.makeNotDeterminedToken()

					// Move to `;|`
					this.offset += 1
					yield this.makeToken(CSSTokenType.SemiColon)

					this.state = ScanState.AnyContent
				}
				
				// |' or |", eat string but not change state.
				else if (this.peekChar() === '"' || this.peekChar() === '\'') {
					this.readString(this.peekChar())
				}

				// `|/*`
				else if (this.peekChars(0, 2) === '/*') {
					yield* this.makeNotDeterminedToken()

					// Move to `/*|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinCSSComment
				}

				// `|//`
				else if (this.isScssLessSyntax && this.peekChars(0, 2) === '//') {
					yield* this.makeNotDeterminedToken()

					// Move to `//|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinScssLessComment
				}

				else {
					this.offset += 1
				}
			}

			else if (this.state === ScanState.WithinSassInterpolation) {

				// `|}`
				if (!this.readUntil(/[}]/g)) {
					break
				}

				yield this.makeToken(CSSTokenType.SassInterpolation)

				// Move to `}|`
				this.offset += 1
				this.sync()
				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinCSSComment) {

				// `|*/`
				if (!this.readUntil(/\*\//g)) {
					break
				}

				yield this.makeToken(CSSTokenType.CommentText)

				// Move to `*/|`
				this.offset += 2
				this.sync()
				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinScssLessComment) {

				// `|\n`
				if (!this.readUntil(/[\r\n]/g)) {
					break
				}

				yield this.makeToken(CSSTokenType.CommentText)

				// Move to `\n|`
				this.offset += 1
				this.sync()
				this.state = ScanState.AnyContent
			}
		}
	}

	private *makeNotDeterminedToken(): Iterable<CSSToken> {
		if (this.start < this.offset && /\S/.test(this.peekText())) {
			yield this.makeToken(CSSTokenType.NotDetermined)
		}
		else {
			this.sync()
		}
	}
}