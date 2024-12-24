import {AnyTokenScanner} from './any'


/** Parsed CSS token. */
export interface CSSToken {
	type: CSSTokenType
	text: string
	start: number
}


/** CSS token type. */
export enum CSSTokenType {

	/** 
	 * When first time doing scanning,
	 * can't determine whether a token is selector or property.
	 */
	NotDetermined,

	ClosureStart,
	ClosureEnd,
	SemiColon,
	Comment,
	SassInterpolation,
}


enum CSSScanState {
	EOF = 0,
	AnyContent = 1,
	WithinSassInterpolation,
	WithinCSSComment,
	WithinSassComment,
}


export class CSSTokenScanner extends AnyTokenScanner<CSSTokenType> {

	declare protected state: CSSScanState
	private isSassSyntax: boolean

	constructor(string: string, isSassSyntax: boolean = false) {
		super(string)
		this.isSassSyntax = isSassSyntax
	}

	*parsePartialTokens(offset: number): Iterable<CSSToken> {
		let start = offset
		let until = Math.max(start - 256, 0)

		for (; start >= until; start--) {
			let char = this.string[start]
			if (char === ';' || char === '{' || char === '}') {
				break
			}
		}

		for (let token of this.parseToTokens(start)) {
			yield token

			let tokenEnd = token.start + token.text.length

			// End with `}` or `;`.
			if (tokenEnd >= offset && (
				token.type === CSSTokenType.ClosureEnd
				|| token.type === CSSTokenType.SemiColon
			)) {
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

		while (this.offset < this.string.length) {
			if (this.state === CSSScanState.AnyContent) {
				this.readUntil(['/', '#', '{', '}', ';', '"', '\''])

				if (this.isEnded()) {
					break
				}

				// |/*
				else if (this.peekChars(0, 2) === '/*') {
					yield* this.endNotDetermined()

					this.state = CSSScanState.WithinCSSComment
					this.syncSteps()
				}

				// |//
				else if (this.isSassSyntax && this.peekChars(0, 2) === '//') {
					yield* this.endNotDetermined()
					
					this.state = CSSScanState.WithinSassComment
					this.syncSteps()
				}

				// |#{
				else if (this.isSassSyntax && this.peekChars(0, 2) === '#{') {
					yield* this.endNotDetermined()
					
					this.state = CSSScanState.WithinSassInterpolation
					this.syncSteps()
				}

				// |{
				else if (this.peekChar() === '{') {
					yield* this.endNotDetermined()
					yield this.makeToken(CSSTokenType.ClosureStart, this.offset, this.offset + 1)
					this.state = CSSScanState.AnyContent
					this.syncSteps(1)
				}

				// |}
				else if (this.peekChar() === '}') {
					yield* this.endNotDetermined()
					yield this.makeToken(CSSTokenType.ClosureEnd, this.offset, this.offset + 1)
					this.state = CSSScanState.AnyContent
					this.syncSteps(1)
				}

				// |;
				else if (this.peekChar() === ';') {
					yield* this.endNotDetermined()
					yield this.makeToken(CSSTokenType.SemiColon, this.offset, this.offset + 1)
					this.state = CSSScanState.AnyContent
					this.syncSteps(1)
				}
				
				// |' or |", eat string but not change state.
				else if (this.peekChar() === '"' || this.peekChar() === '\'') {
					this.readString(this.peekChar())
				}

				else {
					this.offset++
				}
			}

			else if (this.state === CSSScanState.WithinSassInterpolation) {
				this.readUntil(['}'], true)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.SassInterpolation)
				this.state = CSSScanState.AnyContent
				this.syncSteps()
			}

			else if (this.state === CSSScanState.WithinCSSComment) {
				this.readUntil(['*/'], true)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.Comment)
				this.state = CSSScanState.AnyContent
				this.syncSteps()
			}

			else if (this.state === CSSScanState.WithinSassComment) {
				this.readUntil(['\r', '\n'])

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(CSSTokenType.Comment)
				this.state = CSSScanState.AnyContent
				this.syncSteps(1)
			}
		}
	}

	private *endNotDetermined(): Iterable<CSSToken> {
		if (this.start < this.offset && this.string.slice(this.start, this.offset).trim()) {
			yield this.makeToken(CSSTokenType.NotDetermined, this.start, this.offset)
		}
	}
}