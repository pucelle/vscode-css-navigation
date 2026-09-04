import {AnyTokenScanner} from './any'
import {quickBinaryFindIndex} from '../../utils/list'


export interface JSToken {
	type: JSTokenType
	text: string
	start: number
	end: number

	/** Absolute, end-exclusive locations of strings, including their quotes, in Script tokens. */
	stringLocations?: JSStringLocation[]

	/** Absolute, end-exclusive comment ranges, including comment delimiters. */
	commentLocations?: JSStringLocation[]
}

export interface JSStringLocation {
	start: number
	end: number
}

/** Look up a whole match in sorted, non-overlapping string/comment ranges. */
export function isWithinJSNonCode(
	start: number,
	end: number,
	stringLocations: readonly JSStringLocation[] = [],
	commentLocations: readonly JSStringLocation[] = []
): boolean {
	for (let locations of [stringLocations, commentLocations]) {
		let index = quickBinaryFindIndex(locations, location => {
			return location.end <= start ? -1 : location.start > start ? 1 : 0
		})

		if (index >= 0 && end <= locations[index].end) {
			return true
		}
	}

	return false
}

export enum JSTokenType {
	HTML,
	CSS,
	Script,
}


/** 
 * Scan for embedded html and css codes within js or ts files.
 * Note: this is a very simple scanner, it ignore template nesting.
 */
export class JSTokenScanner extends AnyTokenScanner<JSTokenType> {

	declare readonly languageId: Exclude<HTMLLanguageId, 'html'>

	private stringLocations: JSStringLocation[] = []
	private commentLocations: JSStringLocation[] = []

	protected override skipComment(): boolean {
		let start = this.offset
		if (!super.skipComment()) return false
		this.commentLocations.push({start: start + this.scannerStart, end: this.offset + this.scannerStart})
		return true
	}

	protected override readString(): boolean {
		let start = this.offset
		let result = super.readString()
		this.addStringLocation(start, this.offset)
		return result
	}

	/** Template text is a string, but the contents of ${...} are executable code. */
	protected override readTemplateLiteral(): boolean {
		let start = this.offset++

		while (this.readOutToMatch(/[`\\$]/g)) {
			let char = this.peekChar(-1)

			if (char === '`') {
				break
			}

			if (char === '\\') {
				this.offset++
			}
			else if (char === '$' && this.peekChar() === '{') {
				this.addStringLocation(start, this.offset + 1)

				if (!this.readBracketed()) {
					return false
				}
				
				start = this.offset - 1
			}
		}

		this.addStringLocation(start, this.offset)
		return !this.isEnded()
	}

	private addStringLocation(start: number, end: number) {
		this.stringLocations.push({
			start: start + this.scannerStart,
			end: Math.min(end, this.string.length) + this.scannerStart,
		})
	}

	/** Parse html string to tokens. */
	*parseToTokens(): Iterable<JSToken> {
		while (!this.isEnded()) {
			// Parse for at most 100KB.
			if (this.offset > 100000) break
			yield* this.onAnyContent()
		}

		yield* this.makeScriptToken()
	}

	protected *onAnyContent(): Iterable<JSToken> {

		if (!this.readUntilToMatch(/[`'"\/]/g)) {
			return
		}

		let char = this.peekChar()

		if (this.skipComment()) return

		// `|/`, currently can't distinguish it from sign of division.
		if (char === '/') {
			this.tryReadRegExp()
		}

		// `|'`
		else if (char === '\'' || char === '"') {
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
			let token: JSToken = this.makeToken(JSTokenType.Script)
			token.stringLocations = this.stringLocations
			token.commentLocations = this.commentLocations
			this.stringLocations = []
			this.commentLocations = []
			yield token
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
			this.stringLocations = []
			this.commentLocations = []
			yield this.makeToken(JSTokenType.HTML)
		}
		else if (templateTagName === 'css') {
			yield* this.makeScriptToken()

			this.readTemplateLiteral()
			this.stringLocations = []
			this.commentLocations = []
			yield this.makeToken(JSTokenType.CSS)
		}
		else {
			this.readTemplateLiteral()
		}
	}
}
