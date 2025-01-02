import {AnyTokenScanner} from './any'
import {CSSToken, CSSTokenType} from './css'


export enum ScanState {
	EOF = 0,
	AnyContent = 1,
	WithinSassInterpolation,
	WithinCSSComment,
	WithinScssLessComment,
	LineWrap,
}


/** For Sass indented language. */
export class SassIndentedTokenScanner extends AnyTokenScanner<CSSTokenType> {

	declare protected state: ScanState

	constructor(string: string, scannerStart: number = 0) {
		super(string, scannerStart)
	}

	*parsePartialTokens(offset: number): Iterable<CSSToken> {
		while (offset > 0) {
			offset = this.backSearch(offset, ['\r', '\n']) + 1

			if (offset === 0) {
				break
			}

			let charAfter = this.string[offset]
			if (!/[\t ]/.test(charAfter)) {
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
	 * Parse html string to tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(start: number = 0): Iterable<CSSToken> {
		this.start = this.offset = start
		let indentCountStack: number[] = []
		let currentIndentCount = 0

		while (this.state !== ScanState.EOF) {
			if (this.state === ScanState.AnyContent) {
				this.readUntil(/[\/#"'\r\n]/g)

				if (this.isEnded()) {
					break
				}

				// `|/*`
				else if (this.peekChars(0, 2) === '/*') {
					yield* this.endNotDetermined()

					// Move to `/*|`
					this.offset += 2
					this.sync()

					this.state = ScanState.WithinCSSComment
				}

				// `|//`
				else if (this.peekChars(0, 2) === '//') {
					yield* this.endNotDetermined()

					// Move to `//|`
					this.offset += 2
					this.sync()
					
					this.state = ScanState.WithinScssLessComment
				}

				// `|#{`
				else if (this.peekChars(0, 2) === '#{') {
					yield* this.endNotDetermined()

					// Move to `#{|`
					this.offset += 2
					this.sync()
					
					this.state = ScanState.WithinSassInterpolation
				}

				// `|\n`
				else if (this.peekChar() === '\r' || this.peekChar() === '\n') {
					yield* this.endNotDetermined()
					
					// Move to `\n|`
					this.offset += 1

					// Move to `\r\n|`
					if (this.peekChar() === '\r' || this.peekChar() === '\n') {
						this.offset += 1
					}

					this.sync()

					this.state = ScanState.LineWrap
				}

				// |' or |", eat string but not change state.
				else if (this.peekChar() === '"' || this.peekChar() === '\'') {
					this.readString(this.peekChar())
				}

				else {
					this.offset += 1
				}
			}

			else if (this.state === ScanState.WithinSassInterpolation) {

				// `|}`
				this.readUntil(/[}]/g)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.SassInterpolation)

				// Move to `}|`
				this.offset += 1
				this.sync()

				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.LineWrap) {

				// `\t|`
				this.readUntil(/[^\t ]/g)

				if (this.isEnded()) {
					break
				}

				let indentText = this.peekText()
				let indentCount = this.checkIndentCount(indentText)
				this.sync()

				// |.class1
				//     color: red
				if (indentCount > currentIndentCount) {
					yield this.makeToken(CSSTokenType.ClosureStart)

					indentCountStack.push(currentIndentCount)
					currentIndentCount = indentCount
				}

				//     color: red
				// |.class1
				else if (indentCount < currentIndentCount) {
					while (indentCountStack.length > 0 && indentCountStack[indentCountStack.length - 1] >= indentCount) {
						indentCountStack.pop()
						yield this.makeToken(CSSTokenType.ClosureEnd)
					}

					currentIndentCount = indentCount
				}

				// color: red
				// font: Arial
				else {
					yield this.makeToken(CSSTokenType.SemiColon)
				}

				yield this.makeToken(CSSTokenType.SassInterpolation)

				// Move to `}|`
				this.offset += 1
				this.sync()

				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinCSSComment) {

				// `*/|`
				this.readUntil(/\*\//)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.CommentText)

				// Move to `*/|`
				this.offset += 1
				this.sync()

				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinScssLessComment) {

				// `|\n`
				this.readUntil(/[\r\n]/)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.CommentText)

				// Move to `\n|`
				this.offset += 1
				this.sync()

				this.state = ScanState.AnyContent
			}
		}

		while (indentCountStack.length > 0) {
			indentCountStack.pop()
			yield this.makeToken(CSSTokenType.ClosureEnd)
		}
	}

	private checkIndentCount(text: string): number {
		let re = /\t|  /g
		let count = 0

		while (re.exec(text)) {
			count++
		}

		return count
	}

	private *endNotDetermined(): Iterable<CSSToken> {
		if (this.start < this.offset && /\S/.test(this.peekText())) {
			yield this.makeToken(CSSTokenType.NotDetermined)
		}
	}
}