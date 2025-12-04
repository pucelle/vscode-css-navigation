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
}


enum ScanState {
	EOF = 0,
	AnyContent = 1,
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
		}

		yield* this.makeScriptToken()
	}

	protected *onAnyContent(): Iterable<JSToken> {

		// Parse for at most 100KB.
		if (this.offset > 100000) {
			this.state = ScanState.EOF
			return
		}

		if (!this.readUntil(/[`'"]/g)) {
			return
		}

		let char = this.peekChar()

		// `|/`, currently can't distinguish it from sign of division.
		// else if (char === '/') {
		// 	this.readRegExp()
		// }

		// `|'`
		if (char === '\'' || char === '"') {
			this.readString()
		}

		// '|`'
		else if (char === '`') {
			yield* this.mayMakeTemplateLiteralToken()
		}

		else {
			this.offset += 1
		}
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
