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

	declare readonly languageId: CSSLanguageId
	declare protected state: ScanState

	/** 
	 * Parse css string to tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(): Iterable<CSSToken> {
		while (this.state !== ScanState.EOF) {
			if (this.state === ScanState.AnyContent) {
				if (!this.readUntilToMatch(/[\/#{};"']/g)) {
					break
				}

				// `|#{`
				else if (this.languageId !== 'css' && this.peekChars(0, 2) === '#{') {
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
					this.readString()
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
				else if (this.languageId !== 'css' && this.peekChars(0, 2) === '//') {
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
				if (!this.readUntilToMatch(/[}]/g)) {
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
				if (!this.readUntilToMatch(/\*\//g)) {
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
				if (!this.readLine()) {
					break
				}

				yield this.makeToken(CSSTokenType.CommentText)

				// Move to `\n|`
				this.offset += 1
				
				// Move to `\r\n|`
				if (this.peekChar() === '\r' || this.peekChar() === '\n') {
					this.offset += 1
				}

				this.sync()
				this.state = ScanState.AnyContent
			}
		}

		yield* this.makeNotDeterminedToken()
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