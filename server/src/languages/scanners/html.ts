import {AnyTokenScanner} from './any'

/** Parsed HTML token. */
export interface HTMLToken {
	type: HTMLTokenType
	text: string
	start: number
}

/** HTML token type. */
export enum HTMLTokenType {

	/** <!DOCTYPE>. */
	Doctype = 0,

	/** Start tag name exclude `<`. */
	StartTagName = 1,

	/** End tag name exclude `</` and `>`. */
	EndTagName = 2,

	/** `<... >`, not include tag end of close tag. */
	TagEnd = 3,

	/** `<... />`. */
	SelfCloseTagEnd = 4,
	
	/** Attribute name part. */
	AttributeName = 5,

	/** Include quotes. */
	AttributeValue = 6,

	/** Original text, not been trimmed. */
	Text = 7,

	/** Whole comment. */
	Comment = 8,
}

enum HTMLScanState {
	EOF = 0,
	AnyContent = 1,
	WithinStartTag,
	AfterStartTag,
	WithinEndTag,
	WithinAttributeName,
	AfterAttributeName,
	AfterAttributeEqual,
	WithinAttributeValue,
	WithinComment,
	WithinDoctype,
}

const BRACKETS_MAP: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
}


export class HTMLTokenScanner extends AnyTokenScanner<HTMLTokenType> {

	declare protected state: HTMLScanState

	*parsePartialTokens(offset: number): Iterable<HTMLToken> {
		let start = offset
		let until = Math.max(start - 256, 0)

		for (; start >= until; start--) {
			let char = this.string[start]
			if (char === '<') {
				break
			}
		}

		for (let token of this.parseToTokens(start)) {
			yield token

			let tokenEnd = token.start + token.text.length

			// End with `>`.
			if (tokenEnd >= offset && (
				token.type === HTMLTokenType.SelfCloseTagEnd
				|| token.type === HTMLTokenType.TagEnd
				|| token.type === HTMLTokenType.EndTagName
			)) {
				break
			}
		}
	}

	/** Parse html string to tokens. */
	*parseToTokens(start: number = 0): Iterable<HTMLToken> {
		this.start = this.offset = start

		while (this.offset < this.string.length) {
			if (this.state === HTMLScanState.AnyContent) {
				this.readUntil(['<'])

				if (this.isEnded()) {
					break
				}

				// |<!--
				if (this.peekChars(1, 3) === '!--') {
					yield* this.endText()
					this.state = HTMLScanState.WithinComment
					this.syncSteps()
					this.offset += 3
				}

				// |<!
				else if (this.peekChar(1) === '!') {
					yield* this.endText()
					this.state = HTMLScanState.WithinDoctype
					this.syncSteps()
					this.offset += 1
				}

				// |</
				else if (this.peekChar(1) === '/') {
					yield* this.endText()
					this.state = HTMLScanState.WithinEndTag
					this.syncSteps(2)
				}

				// |<a
				else if (this.isNameChar(this.peekChar(1))) {
					yield* this.endText()
					this.state = HTMLScanState.WithinStartTag
					this.syncSteps(1)
				}
				else {
					this.offset += 1
				}
			}

			else if (this.state === HTMLScanState.WithinComment) {
				// -->|
				this.readUntil(['-->'], true)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(HTMLTokenType.Comment, this.start, this.offset + 1)
				this.state = HTMLScanState.AnyContent
				this.syncSteps()
			}

			else if (this.state === HTMLScanState.WithinDoctype) {
				this.readUntil(['>'], true)

				if (this.isEnded()) {
					break
				}

				// |>
				yield this.makeToken(HTMLTokenType.Doctype)
				this.state = HTMLScanState.AnyContent
				this.syncSteps()
			}

			else if (this.state === HTMLScanState.WithinStartTag) {

				// <abc| ..
				this.readUntilCharNotMatch(this.isNameChar)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(HTMLTokenType.StartTagName)
				this.state = HTMLScanState.AfterStartTag
				this.syncSteps()
			}

			else if (this.state === HTMLScanState.WithinEndTag) {

				// </abc|> or </|>
				this.readUntilCharNotMatch(this.isNameChar)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(HTMLTokenType.EndTagName)

				// </abc|>
				this.readUntil(['>'], true)

				if (this.isEnded()) {
					break
				}

				this.state = HTMLScanState.AnyContent
				this.syncSteps()
			}

			else if (this.state === HTMLScanState.AfterStartTag) {
				let char = this.peekChar()
				if (char === '>') {

					// /|>
					if (this.peekChar(-1) === '/') {
						yield this.makeToken(HTMLTokenType.SelfCloseTagEnd, this.offset - 1, this.offset + 1)
					}

					// |>
					else {
						yield this.makeToken(HTMLTokenType.TagEnd, this.offset, this.offset + 1)
					}

					this.state = HTMLScanState.AnyContent
					this.syncSteps(1)
				}

				// |name
				else if (this.isAttrNameChar(char)) {
					this.state = HTMLScanState.WithinAttributeName
					this.syncSteps()
				}

				else {
					this.syncSteps(1)
				}
			}

			else if (this.state === HTMLScanState.WithinAttributeName) {

				// name|
				this.readUntilCharNotMatch(this.isAttrNameChar)
				
				yield this.makeToken(HTMLTokenType.AttributeName)
				this.state = HTMLScanState.AfterAttributeName
				this.syncSteps()
			}

			else if (this.state === HTMLScanState.AfterAttributeName) {
				this.readUntilCharNotMatch(this.isEmptyChar)

				// name|=
				if (this.peekChar() === '=') {
					this.offset++
					this.readUntilCharNotMatch(this.isEmptyChar)
					this.state = HTMLScanState.WithinAttributeValue
					this.syncSteps()
				}

				//name |?
				else {
					this.state = HTMLScanState.AfterStartTag
					this.syncSteps()
				}
			}

			else if (this.state === HTMLScanState.WithinAttributeValue) {
				let char = this.peekChar()

				// =|"..."
				if (char === '"' || char === '\'') {

					// "..."|
					this.readString(char)
					yield this.makeToken(HTMLTokenType.AttributeValue)

					this.state = HTMLScanState.AfterStartTag
					this.syncSteps()
				}
				else {

					// name=value
					// name=${{a: b}}
					// name={[a, b]}
					this.readExpressionLikeAttrValue()
					yield this.makeToken(HTMLTokenType.AttributeValue)

					this.state = HTMLScanState.AfterStartTag
					this.syncSteps()
				}
			}
		}

		if (this.state === HTMLScanState.EOF) {
			yield* this.endText()
		}
	}

	/** Try read an expression as attribute value, brackets or quotes must appear in pairs. */
	private readExpressionLikeAttrValue() {
		let stack: string[] = []
		let allChars = ['(', '[', '{', '"', '\'', ' ', '\t', '\r', '\n', '>']
		let close: string | null = null

		do {
			this.readUntil(close ? [close, '(', '[', '{'] : allChars)

			if (this.isEnded()) {
				return
			}
			
			let char = this.peekChar()
			if (char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === '>') {
				break
			}
			else if (char === '"' || char === '\'') {
				this.readString(char)
				continue
			}

			// Eat the char.
			this.offset += 1

			if (char === close) {
				if (stack.length > 0) {
					close = stack.pop()!
				}
				else {
					close = null
				}
			}
			else {
				if (close) {
					stack.push(close)
				}

				close = BRACKETS_MAP[char]
			}
		}
		while (true)
	}

	private isNameChar(char: string): boolean {

		// Add `$` to match template interpolation.
		return /[\w:$]/.test(char)
	}

	private isAttrNameChar(char: string): boolean {
		return /[\w@:.?$-]/.test(char)
	}

	private *endText(): Iterable<HTMLToken> {
		if (this.start < this.offset) {
			yield this.makeToken(HTMLTokenType.Text, this.start, this.offset)
		}
	}
}
