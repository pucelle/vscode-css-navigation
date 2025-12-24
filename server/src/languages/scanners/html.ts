import {LanguageIds} from '../language-ids'
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

	declare readonly languageId: HTMLLanguageId
	declare protected state: ScanState
	protected endTagNameMustMatch: string | null = null;

	/** Parse html string to tokens. */
	*parseToTokens(): Iterable<HTMLToken> {
		while (this.state !== ScanState.EOF) {
			if (this.state === ScanState.AnyContent) {
				yield* this.onAnyContent()
			}
			else if (this.state === ScanState.WithinComment) {
				yield* this.onWithinComment()
			}
			else if (this.state === ScanState.WithinDoctype) {
				yield* this.onWithinDoctype()
			}
			else if (this.state === ScanState.WithinStartTag) {
				yield* this.onWithinStartTag()
			}
			else if (this.state === ScanState.WithinEndTag) {
				yield* this.onWithinEndTag()
			}
			else if (this.state === ScanState.AfterStartTag) {
				yield* this.onAfterStartTag()
			}
			else if (this.state === ScanState.WithinAttributeName) {
				yield* this.onWithinAttributeName()
			}
			else if (this.state === ScanState.AfterAttributeName) {
				this.onAfterAttributeName()
			}
			else if (this.state === ScanState.WithinAttributeValue) {
				yield* this.onWithinAttributeValue()
			}
		}

		yield* this.makeTextToken()
	}

	protected *onAnyContent(): Iterable<HTMLToken> {

		// `|<`
		if (!this.readUntilToMatch(/</g)) {
			return
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

	protected *onWithinComment(): Iterable<HTMLToken> {

		// `-->|`
		if (!this.readUntilToMatch(/-->/g)) {
			return
		}

		yield this.makeToken(HTMLTokenType.CommentText)

		// Move to `-->|`
		this.offset += 3
		this.sync()
		this.state = ScanState.AnyContent
	}

	protected *onWithinDoctype(): Iterable<HTMLToken> {
		
		// `|>`
		if (!this.readUntilToMatch(/>/g)) {
			return
		}

		yield this.makeToken(HTMLTokenType.Doctype)

		// Move to `>|`
		this.offset += 1
		this.sync()
		this.state = ScanState.AnyContent
	}

	protected *onWithinStartTag(): Iterable<HTMLToken> {
		
		// `<abc|`
		this.readUntilNot(IsTagName)

		let tagName = this.peekText()
		let lowerTagName = tagName.toLowerCase()
		yield this.makeToken(HTMLTokenType.StartTagName)

		if (lowerTagName === 'script' || lowerTagName === 'style') {
			this.endTagNameMustMatch = lowerTagName
		}

		this.state = ScanState.AfterStartTag
	}

	protected *onWithinEndTag(): Iterable<HTMLToken> {

		// `</abc|>` or `</|>`
		this.readUntilNot(IsTagName)

		let tagName = this.peekText()
		let lowerTagName = tagName.toLowerCase()

		// Must end when `</style>` or `</script>`
		if (this.endTagNameMustMatch && lowerTagName !== this.endTagNameMustMatch) {
			this.state = ScanState.AnyContent
		}
		else {
			this.endTagNameMustMatch = null

			// This token may be empty.
			yield this.makeToken(HTMLTokenType.EndTagName)

			// `</abc>|`, skip `>`
			if (!this.readOutToMatch(/>/g)) {
				return
			}

			this.sync()
			this.state = ScanState.AnyContent
		}
	}

	protected *onAfterStartTag(): Iterable<HTMLToken> {
		
		// Skip whitespaces.
		this.readWhiteSpaces()

		let char = this.peekChar()

		if (char === '>') {

			// Move to `>|`
			this.offset += 1
			this.sync()

			// `/>|`
			if (this.peekChar(-2) === '/') {
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

	protected *onWithinAttributeName(): Iterable<HTMLToken> {
		
		// `name|`
		this.readUntilToMatch(IsNotAttrName)
		yield this.makeToken(HTMLTokenType.AttributeName)

		this.state = ScanState.AfterAttributeName
	}

	protected onAfterAttributeName() {
		
		// Skip white spaces.
		if (!this.readWhiteSpaces()) {
			return
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

	protected *onWithinAttributeValue(): Iterable<HTMLToken> {
		let char = this.peekChar()

		// `=|"..."`
		if (char === '"' || char === '\'') {

			// "..."|
			this.readString()
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

	protected *makeTextToken(): Iterable<HTMLToken> {
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
	protected readExpressionLikeAttrValue() {
		let stack: string[] = []
		let expect: string | null = null
		let re = /[()\[\]{}"'`\/\s>]/g

		while (this.state !== ScanState.EOF) {
			if (!this.readUntilToMatch(re)) {
				return
			}
			
			let char = this.peekChar()

			// Only difference with `readBracketed`.
			if (!expect && /[\s>]/.test(char)) {
				break
			}

			// `|"..."`
			else if (char === '"' || char === '\'') {
				this.readString()
				continue
			}

			// '|`...`'
			else if (char === '`' && LanguageIds.isScriptSyntax(this.languageId)) {
				this.readTemplateLiteral()
				continue
			}
			
			// `|/*`
			else if (char === '/' && this.peekChar(1) === '*') {

				// Move cursor to `/*|`.
				this.offset += 2

				this.readOutToMatch(/\*\//g)
				continue
			}

			// `|//`
			else if (char === '/' && this.peekChar(1) === '/') {

				// Move cursor to `//|`.
				this.offset += 2

				this.readLineAndEnd()
				continue
			}

			// `/.../`
			else if (char === '/') {
				this.tryReadRegExp()
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

		return this.state !== ScanState.EOF
	}
}



/** 
 * For parsing react elements.
 * It try matches start and end tags, and make them to be
 * recognized as tags only when found match pair.
 */
export class WhiteListHTMLTokenScanner extends HTMLTokenScanner {

	readonly whiteList: Set<string>

	constructor(string: string, scannerStart: number = 0, languageId: AllLanguageId, whiteList: Set<string>) {
		super(string, scannerStart, languageId, )
		this.whiteList = whiteList
	}

	protected *onWithinStartTag(): Iterable<HTMLToken> {
		
		// `<abc|`
		this.readUntilNot(IsTagName)
		

		let tagName = this.peekText()

		// If not in white list.
		if (!this.whiteList.has(tagName)) {
			this.state = ScanState.AnyContent
			return
		}

		yield this.makeToken(HTMLTokenType.StartTagName)

		if (tagName === 'style') {
			this.endTagNameMustMatch = tagName
		}

		this.state = ScanState.AfterStartTag
	}

	protected *onWithinEndTag(): Iterable<HTMLToken> {

		// `</abc|>` or `</|>`
		this.readUntilNot(IsTagName)

		let tagName = this.peekText()

		if (!this.whiteList.has(tagName)) {
			this.state = ScanState.AnyContent
			return
		}

		// Must end when `</style>` or `</script>`
		if (this.endTagNameMustMatch && tagName !== this.endTagNameMustMatch) {
			this.state = ScanState.AnyContent
			return
		}

		this.endTagNameMustMatch = null

		// This token may be empty.
		yield this.makeToken(HTMLTokenType.EndTagName)

		// `</abc>|`, skip `>`
		if (!this.readOutToMatch(/>/g)) {
			return
		}

		this.sync()
		this.state = ScanState.AnyContent
	}
}
