import {AnyTokenScanner} from './any'


export interface JSToken {
	type: JSTokenType
	text: string
	start: number
	end: number
}

export enum JSTokenType {
	HTML,
	CSS,
	Script,
	CommentText,
}


enum ScanState {
	EOF = 0,
	AnyContent = 1,

	WithinSingleLineComment,
	WithinMultiLineComment,
}


/** 
 * Scan for embedded html and css codes within js or ts files.
 * Note: this is a very simple scanner, it ignore template nesting.
 */
export class JSTokenScanner extends AnyTokenScanner<JSTokenType> {

	declare readonly languageId: Exclude<HTMLLanguageId, 'html'>
	declare protected state: ScanState

	/** Parse html string to tokens. */
	*parseToTokens(): Iterable<JSToken> {
		while (this.state !== ScanState.EOF) {
			if (this.state === ScanState.AnyContent) {
				yield* this.onAnyContent()
			}
			else if (this.state === ScanState.WithinSingleLineComment) {
				yield* this.onWithinSingleLineComment()
			}
			else if (this.state === ScanState.WithinMultiLineComment) {
				yield* this.onWithinMultiLineComment()
			}
		}

		yield* this.makeScriptToken()
	}

	protected *onAnyContent(): Iterable<JSToken> {

		// Parse for at most 100KB.
		if (this.offset > 100000) {
			this.state = ScanState.EOF
			return
		}

		if (!this.readUntil(/[`'"\/]/g)) {
			return
		}

		// `|//`
		if (this.peekChars(0, 2) === '//') {
			yield* this.makeScriptToken()

			// Move to `//|`
			this.offset += 2
			this.sync()
			this.state = ScanState.WithinSingleLineComment
		}

		// `|/*`
		else if (this.peekChars(0, 2) === '/*') {
			yield* this.makeScriptToken()

			// Move to `/*|`
			this.offset += 2
			this.sync()
			this.state = ScanState.WithinMultiLineComment
		}

		// `|/`
		else if (this.peekChar() === '/') {
			this.readRegExp()
		}

		// `|'`
		else if (this.peekChar() === '\'' || this.peekChar() === '"') {
			this.readString()
		}

		// '|`'
		else if (this.peekChar() === '`') {
			yield* this.mayMakeTemplateLiteralToken()
		}

		else {
			this.offset += 1
		}
	}

	protected *onWithinSingleLineComment(): Iterable<JSToken> {

		// `|\n`
		if (!this.readLine()) {
			return
		}

		yield this.makeToken(JSTokenType.CommentText)

		// Move to `\n|`
		this.offset += 1
		this.sync()
		this.state = ScanState.AnyContent
	}

	protected *onWithinMultiLineComment(): Iterable<JSToken> {

		// `|*/`
		if (!this.readUntil(/\*\//g)) {
			return
		}

		yield this.makeToken(JSTokenType.CommentText)

		// Move to `*/|`
		this.offset += 2
		this.sync()
		this.state = ScanState.AnyContent
	}

	protected *makeScriptToken(): Iterable<JSToken> {
		if (this.start < this.offset) {
			yield this.makeToken(JSTokenType.Script)
		}
		else {
			this.sync()
		}
	}

	protected *mayMakeTemplateLiteralToken(): Iterable<JSToken> {
		let templateTagName = ''
		let nonWhiteSpacesOffset = this.backSearchChar(this.offset - 1, /\S/g)

		if (nonWhiteSpacesOffset > -1) {
			let nameStartOffset = this.backSearchChar(nonWhiteSpacesOffset, /[^\w]/g)
			templateTagName = this.string.slice(nameStartOffset + 1, nonWhiteSpacesOffset + 1)
		}

		if (templateTagName === 'html') {
			yield* this.makeScriptToken()

			this.readTemplateLiteral()
			yield this.makeToken(JSTokenType.HTML)
		}
		else if (templateTagName === 'css') {
			yield* this.makeScriptToken()

			this.readTemplateLiteral()
			yield this.makeToken(JSTokenType.CSS)
		}
		else {
			this.readTemplateLiteral()
		}
	}
}
