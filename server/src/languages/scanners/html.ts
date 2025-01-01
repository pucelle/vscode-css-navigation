import {AnyTokenScanner, BRACKETS_MAP} from './any'


/** Parsed HTML token. */
export interface HTMLToken {
	type: HTMLTokenType
	text: string
	start: number
	end: number
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

	/** Exclude `<!--` and `-->`. */
	CommentText = 8,
}

enum ScanState {
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


/** Match tag name, Add `$` to match template interpolation. */
const IsTagName = /[\w:-]/g

/** Match not tag name. */
const IsNotTagName = /[^\w:-]/g

/** Match attribute name. */
const IsAttrName = /[\w@:.?$-]/g

/** Match not attribute name. */
const IsNotAttrName = /[^\w@:.?$-]/g


function isTagName(char: string): boolean {
	IsTagName.lastIndex = 0
	return IsTagName.test(char)
}

function isAttrName(char: string): boolean {
	IsAttrName.lastIndex = 0
	return IsAttrName.test(char)
}



export class HTMLTokenScanner extends AnyTokenScanner<HTMLTokenType> {

	declare protected state: ScanState
	private isJSLikeSyntax: boolean

	constructor(string: string, isJSLikeSyntax: boolean = false) {
		super(string)
		this.isJSLikeSyntax = isJSLikeSyntax
	}

	/** 
	 * Parse for partial tokens at offset.
	 * Note this fails when located inside of a string literal.
	 */
	*parsePartialTokens(offset: number): Iterable<HTMLToken> {
		let start = this.backSearch(offset, ['<'], 256)
		if (start === -1) {
			start = 0
		}

		for (let token of this.parseToTokens(start)) {
			yield token

			// End with `>`.
			if (token.end >= offset && (
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
		let mustMatchTagName: string | null = null

		while (this.offset < this.string.length) {
			if (this.state === ScanState.AnyContent) {

				// `|<`
				if (!this.readUntil(/</g)) {
					break
				}

				// `|<!--`
				if (this.peekChars(1, 3) === '!--') {
					yield* this.makeTextToken()

					// Move to `<--|`
					this.offset += 3
					this.sync()
					this.state = ScanState.WithinComment
				}

				// |<!
				else if (this.peekChar(1) === '!') {
					yield* this.makeTextToken()

					// Move to `<!|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinDoctype
				}

				// `|</`
				else if (this.peekChar(1) === '/') {
					yield* this.makeTextToken()

					// Move to `</|`
					this.offset += 2
					this.sync()
					this.state = ScanState.WithinEndTag
				}

				// `|<a`
				else if (isTagName(this.peekChar(1))) {
					yield* this.makeTextToken()

					// Move to `<|a`
					this.offset += 1
					this.sync()
					this.state = ScanState.WithinStartTag
				}
				else {
					this.offset += 1
				}
			}

			else if (this.state === ScanState.WithinComment) {
				
				// `-->|`
				this.readUntil(/-->/g)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(HTMLTokenType.CommentText)

				// Move to `-->|`
				this.offset += 3
				this.sync()
				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinDoctype) {

				// `|>`
				this.readUntil(/>/g)

				if (this.isEnded()) {
					break
				}

				yield this.makeToken(HTMLTokenType.Doctype)

				// Move to `>|`
				this.offset += 1
				this.sync()
				this.state = ScanState.AnyContent
			}

			else if (this.state === ScanState.WithinStartTag) {

				// `<abc|`
				if (!this.readUntil(IsNotTagName)) {
					break
				}

				let tagName = this.peekText()
				let lowerTagName = tagName.toLowerCase()
				yield this.makeToken(HTMLTokenType.StartTagName)

				if (lowerTagName === 'script' || lowerTagName === 'style') {
					mustMatchTagName = lowerTagName
				}

				this.state = ScanState.AfterStartTag
			}

			else if (this.state === ScanState.WithinEndTag) {

				// `</abc|>` or `</|>`
				if (!this.readUntil(IsNotTagName)) {
					break
				}

				let tagName = this.peekText()
				let lowerTagName = tagName.toLowerCase()

				// Must end when `</style>` or `</script>`
				if (mustMatchTagName && lowerTagName !== mustMatchTagName) {
					this.state = ScanState.AnyContent
				}
				else {
					mustMatchTagName = null

					// This token may be empty.
					yield this.makeToken(HTMLTokenType.EndTagName)

					// `</abc>|`, skip `>`
					if (!this.readOut(/>/g)) {
						break
					}

					this.sync()
					this.state = ScanState.AnyContent
				}
			}

			else if (this.state === ScanState.AfterStartTag) {

				// Skip whitespaces.
				this.readWhiteSpaces()

				let char = this.peekChar()

				// If meet another tag start, use the late one.
				// For js codes like `if (a<b){<div>}`.
				if (char === '<' && this.isJSLikeSyntax && isAttrName(this.peekChar(1))) {
					yield* this.makeTextToken()

					// Move to `<|a`
					this.offset += 1
					this.sync()
					this.state = ScanState.WithinStartTag
				}

				else if (char === '>') {

					// Move to `>|`
					this.offset += 1
					this.sync()

					// `/>|`
					if (this.peekChar(-1) === '/') {
						yield this.makeToken(HTMLTokenType.SelfCloseTagEnd)
					}

					// `>|`
					else {
						yield this.makeToken(HTMLTokenType.TagEnd)
					}

					this.state = ScanState.AnyContent
				}

				// `|name`
				else if (isAttrName(char)) {
					this.sync()
					this.state = ScanState.WithinAttributeName
				}

				else {
					this.offset += 1
				}
			}

			else if (this.state === ScanState.WithinAttributeName) {

				// `name|`
				this.readUntil(IsNotAttrName)
				yield this.makeToken(HTMLTokenType.AttributeName)

				this.state = ScanState.AfterAttributeName
			}

			else if (this.state === ScanState.AfterAttributeName) {
				
				// Skip white spaces.
				if (!this.readWhiteSpaces()) {
					break
				}

				this.sync()

				// `name|=`
				if (this.peekChar() === '=') {

					// Skip `=`.
					this.offset += 1

					// Skip white spaces.
					this.readWhiteSpaces()
					this.sync()

					this.state = ScanState.WithinAttributeValue
				}

				// `name |?`
				else {
					this.state = ScanState.AfterStartTag
					this.sync()
				}
			}

			else if (this.state === ScanState.WithinAttributeValue) {
				let char = this.peekChar()

				// `=|"..."`
				if (char === '"' || char === '\'') {

					// "..."|
					this.readString(char)
					yield this.makeToken(HTMLTokenType.AttributeValue)

					this.state = ScanState.AfterStartTag
				}
				else {

					// `name=value`
					// `name=${{a: b}}`
					// `name={[a, b]}`
					this.readExpressionLikeAttrValue()
					yield this.makeToken(HTMLTokenType.AttributeValue)

					this.state = ScanState.AfterStartTag
				}
			}
		}

		yield* this.makeTextToken()
	}

	private *makeTextToken(): Iterable<HTMLToken> {
		if (this.start < this.offset) {
			yield this.makeToken(HTMLTokenType.Text)
		}
		else {
			this.sync()
		}
	}
	
	/** 
	 * Try read an expression as attribute value,
	 * brackets or quotes must appear in pairs.
	 */
	private readExpressionLikeAttrValue() {
		let stack: string[] = []
		let expect: string | null = null
		let re = /[()\[\]{}"'`\/\s>]/g

		do {
			this.readUntil(re)

			if (this.isEnded()) {
				return
			}
			
			let char = this.peekChar()

			if (!expect && /[\s>]/.test(char)) {
				break
			}

			if (char === '"' || char === '\'' || char === '`') {
				this.readString(char)
				continue
			}
			
			if (char === '/' && this.peekChar(1) === '*') {
				this.readOut(/\*\//g)
				continue
			}

			if (char === '/' && this.peekChar(1) === '/') {
				this.readOut(/[\r\n]/g)
				continue
			}

			// Eat the char.
			this.offset += 1

			if (char === expect) {
				if (stack.length > 0) {
					expect = stack.pop()!
				}
				else {
					expect = null
				}
			}
			else if (char === '[' || char === '(' || char === '{') {
				if (expect) {
					stack.push(expect)
				}

				expect = BRACKETS_MAP[char]
			}
		}
		while (true)
	}
}
