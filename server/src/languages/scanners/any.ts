import {LanguageIds} from '../language-ids'

/** Parsed Any token. */
export interface AnyToken<T extends number> {
	type: T
	text: string
	start: number
	end: number
}

export const BRACKETS_MAP: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
}

enum ScanState {
	EOF = 0,
	AnyContent = 1,
}


export class AnyTokenScanner<T extends number> {

	readonly string: string
	readonly scannerStart: number
	readonly languageId: HTMLLanguageId | CSSLanguageId

	protected start = 0
	protected offset = 0
	protected state: number = ScanState.AnyContent

	constructor(string: string, scannerStart: number = 0, languageId: AllLanguageId) {
		this.string = string
		this.scannerStart = scannerStart
		this.languageId = languageId
	}

	protected isEnded(): boolean {
		return this.state === ScanState.EOF
	}

	protected peekChars(move: number = 0, count: number): string {
		return this.string.slice(this.offset + move, this.offset + move + count)
	}

	protected peekChar(move: number = 0): string {
		return this.string.substring(this.offset + move, this.offset + move + 1)
	}

	/** Peek text within `start` and `offset`. */
	protected peekText() {
		return this.string.slice(this.start, this.offset)
	}

	/** 
	 * Peek chars from current offset until expression.
	 * Will not move offset.
	 */
	protected peekUntil(re: RegExp): string {
		re.lastIndex = this.offset
		let m = re.exec(this.string)

		if (m) {
			return this.string.slice(this.offset, m.index)
		}
		else {
			return ''
		}
	}

	/** 
	 * It moves `offset` to before match.
	 * Note the `re` must have `g` flag set.
	 */
	protected readUntil(re: RegExp): RegExpExecArray | null {
		re.lastIndex = this.offset
		let m = re.exec(this.string)

		if (m) {
			this.offset = m.index
		}
		else {
			this.offset = this.string.length
			this.state = ScanState.EOF
		}

		return m
	}

	/** 
	 * It moves `offset` to after match.
	 * Note the `re` must have `g` flag set.
	 */
	protected readOut(re: RegExp): RegExpExecArray | null {
		re.lastIndex = this.offset
		let m = re.exec(this.string)

		if (m) {
			this.offset = m.index + m[0].length
		}
		else {
			this.offset = this.string.length
			this.state = ScanState.EOF
		}

		return m
	}

	/** 
	 * Return after position of end quote: `"..."|`.
	 * Cursor must before first quote: `|""`.
	 */
	protected readString(): boolean {
		let quote = this.peekChar()

		// Avoid read start quote.
		this.offset += 1

		while (true) {
			// "..."|
			if (!this.readOut(/['"\\]/g)) {
				break
			}

			let char = this.peekChar(-1)
			
			if (char === quote) {
				break
			}

			// Skip next character.
			if (char === '\\') {
				this.offset += 1
			}
		}

		return this.state !== ScanState.EOF
	}

	/** Read all whitespaces. */
	protected readWhiteSpaces(): boolean {
		return !!this.readUntil(/\S/g)
	}

	/** Read chars until before `\r\n`. */
	protected readLine(): boolean {
		if (!this.readUntil(/[\r\n]/g)) {
			return false
		}

		if (this.peekChar() === '\r' && this.peekChar(1) === '\n') {
			this.offset += 1
		}

		return true
	}

	/** Read chars until after `\r\n`. */
	protected readLineAndEnd(): boolean {
		if (!this.readLine()) {
			return false
		}

		this.offset += 1

		return true
	}

	/** 
	 * Try read an bracketed expression like `[...]`, `(...)`, `{...}`,
	 * Must ensure the current char is one of `[{(`.
	 * brackets or quotes must appear in pairs.
	 * It stops after found all matching end brackets.
	 * Supported language js, css, sass, less.
	 */
	protected readBracketed(): boolean {
		let stack: string[] = []
		let expect: string | null = null
		let re = /[()\[\]{}"'`\/\s]/g

		while (this.state !== ScanState.EOF) {
			if (!this.readUntil(re)) {
				break
			}
			
			let char = this.peekChar()

			if (!expect && /[\s]/.test(char)) {
				break
			}

			// `"..."`
			else if (char === '"' || char === '\'') {
				this.readString()
			}
			
			// '`...`'
			else if (char === '`' && LanguageIds.isScriptSyntax(this.languageId)) {
				this.readTemplateLiteral()
			}

			// `/*`
			else if (char === '/' && this.peekChar(1) === '*') {
				this.readOut(/\*\//g)
			}

			// `//`
			else if (char === '/' && this.peekChar(1) === '/' && this.languageId !== 'css') {
				if (!this.readLineAndEnd()) {
					break
				}
			}

				// `|/`
			else if (char === '/' && LanguageIds.isScriptSyntax(this.languageId)) {

				// Move to `/|`, and read out whole expression.
				this.readRegExp()
			}

			// Eat the char.
			this.offset += 1

			if (char === expect) {
				if (stack.length > 0) {
					expect = stack.pop()!
				}
				else {
					break
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

	/** Read `...`, must ensure the current char is `\``. */
	protected readTemplateLiteral(): boolean {
		let re = /[`\\$]/g

		// Avoid read start quote.
		this.offset += 1

		while (true) {
			if (!this.readOut(re)) {
				break
			}

			let char = this.peekChar(-1)
			
			if (char === '`') {
				break
			}

			else if (char === '$' && this.peekChar() === '{') {
				if (!this.readBracketed()) {
					break
				}
			}

			// Skip next character.
			else if (char === '\\') {
				this.offset += 1
			}
		}

		return this.state !== ScanState.EOF
	}

	/** 
	 * Read a regexp expression like `/.../`.
	 * Cursor must locate at `|/`
	 */
	protected readRegExp(): boolean {
		let withinCharList = false

		// Move cursor to `/|`
		this.offset += 1

		while (true) {
			if (!this.readOut(/[\\\[\]\/]/g)) {
				return false
			}

			let char = this.peekChar(-1)
			
			// `\|.`, skip next char, even within character list.
			if (char === '\\') {

				// Move to `\.|`
				this.offset += 1
			}

			// `[|`, start character list.
			else if (char === '[' && !withinCharList) {
				withinCharList = true
			}

			// `]|`, end character list.
			else if (char === ']' && withinCharList) {
				withinCharList = false
			}

			// `/|`, end regexp.
			else if (char === '/' && !withinCharList) {
				break
			}
		}

		return !!this.readUntil(/[^a-z]/g)
	}

	/** 
	 * Back search from `offset` to preceding.
	 * Can only search one character each time.
	 */
	protected backSearchChar(from: number, match: RegExp, maxCount: number = Infinity): number {
		let until = Math.max(from - maxCount, 0)

		for (let i = from; i >= until; i--) {
			let char = this.string[i]
			if (match.test(char)) {
				return i
			}
		}

		return -1
	}

	/** Note it will sync start to offset. */
	protected makeToken(type: T): AnyToken<T> {
		let start = this.start
		let end = this.offset

		this.sync()

		return {
			type,
			text: this.string.slice(start, end),
			start: start + this.scannerStart,
			end: end + this.scannerStart,
		}
	}

	/** Moves start to current offset and skip all chars between. */
	protected sync() {
		this.start = this.offset
	}
}