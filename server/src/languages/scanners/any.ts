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

	protected string: string
	protected start = 0
	protected offset = 0
	protected state: number = ScanState.AnyContent

	constructor(string: string) {
		this.string = string
	}

	protected isEnded(): boolean {
		return this.state === ScanState.EOF
	}

	protected peekChars(move: number = 0, count: number): string {
		return this.string.slice(this.offset + move, this.offset + move + count)
	}

	protected peekChar(move: number = 0): string {
		return this.string[this.offset + move]
	}

	/** Peek text within `start` and `offset`. */
	protected peekText() {
		return this.string.slice(this.start, this.offset)
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

	/** Return after position of end quote: `"..."|` */
	protected readString(quote: string): boolean {

		// Avoid read start quote.
		this.offset += 1

		do {
			// "..."|
			if (!this.readOut(/['"`\\]/g)) {
				return false
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
		while (true)

		return true
	}

	/** Read all whitespaces. */
	protected readWhiteSpaces(): boolean {
		return !!this.readUntil(/\S/g)
	}

	/** 
	 * Try read an bracketed expression like `[...]`, `(...)`,
	 * brackets or quotes must appear in pairs.
	 * It stops after found all matching end brackets.
	 */
	protected readBracketed(): boolean {
		let stack: string[] = []
		let expect: string | null = null
		let re = /[()\[\]{}"'`\/\s]/g

		do {
			if (!this.readUntil(re)) {
				return false
			}
			
			let char = this.peekChar()

			if (!expect && /[\s]/.test(char)) {
				break
			}

			if (char === '"' || char === '\'' || char === '`') {
				if (!this.readString(char)) {
					break
				}
				continue
			}

			if (char === '/' && this.peekChar(1) === '*') {
				if (!this.readOut(/\*\//g)) {
					break
				}
				continue
			}

			if (char === '/' && this.peekChar(1) === '/') {
				if (!this.readOut(/[\r\n]/g)) {
					break
				}
				continue
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
		while (true)

		return true
	}

	/** Search from `offset` to front. */
	protected search(offset: number, match: string[], maxCount: number = Infinity): number {
		let until = Math.min(offset + maxCount, this.string.length)
		let i = offset

		for (; i <= until; i++) {
			let char = this.string[i]
			if (match.includes(char)) {
				return i
			}
		}

		return -1
	}

	/** Back search from `offset` to front. */
	protected backSearch(offset: number, match: string[], maxCount: number = Infinity, ): number {
		let until = Math.max(offset - maxCount, 0)
		let i = offset

		for (; i >= until; i--) {
			let char = this.string[i]
			if (match.includes(char)) {
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
			start,
			end,
		}
	}

	/** Moves start to current offset and skip all chars between. */
	protected sync() {
		this.start = this.offset
	}
}