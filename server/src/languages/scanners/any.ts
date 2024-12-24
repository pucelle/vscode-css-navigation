/** Parsed Any token. */
export interface AnyToken<T extends number> {
	type: T
	text: string
	start: number
}


enum AnyScanState {
	EOF = 0,
	AnyContent = 1,
}


export abstract class AnyTokenScanner<T extends number> {

	protected string: string
	protected start = 0
	protected offset = 0
	protected state: number = AnyScanState.AnyContent

	constructor(string: string) {
		this.string = string
	}

	protected isEnded(): boolean {
		return this.state === AnyScanState.EOF
	}

	protected peekChars(move: number = 0, count: number): string {
		return this.string.slice(this.offset + move, this.offset + move + count)
	}

	protected peekChar(move: number = 0): string {
		return this.string[this.offset + move]
	}

	protected isEmptyChar(char: string): boolean {
		return /\s/.test(char)
	}

	protected syncSteps(move: number = 0) {
		this.start = this.offset = this.offset + move
	}

	/** 
	 * It moves `offset` to before match by default,
	 * can specify `moveOffsetAfter=true` to move after match.
	 */
	protected readUntil(matches: string[], moveOffsetAfter: boolean = false) {
		for (let i = this.offset; i < this.string.length; i++) {
			let char = this.string[i]

			for (let match of matches) {
				if (match[0] !== char) {
					continue
				}

				if (match.length === 1 || match === this.string.slice(i, i + match.length)) {
					this.offset = moveOffsetAfter ? i + match.length : i
					return
				}
			}
		}

		this.offset = this.string.length
		this.state = AnyScanState.EOF as T
	}

	/** It moves `offset` to before not match character. */
	protected readUntilCharNotMatch(test: (char: string) => boolean) {
		for (let i = this.offset; i < this.string.length; i++) {
			let char = this.string[i]
			if (!test(char)) {
				this.offset = i
				return
			}
		}

		this.offset = this.string.length
		this.state = AnyScanState.EOF as T
	}

	/** After end, offset locate to the position of end quote: `"..."|` */
	protected readString(quote: string) {

		// Avoid read start quote.
		this.offset++

		do {
			// "..."|
			this.readUntil(['\\', quote], true)

			if (this.isEnded()) {
				return
			}
			
			if (this.peekChar(-1) === quote) {
				break
			}

			// Eat the char after `\`.
			else {
				this.offset++
			}
		}
		while (true)
	}

	protected makeToken(type: T, start: number = this.start, end: number = this.offset): AnyToken<T> {
		return {
			type,
			text: this.string.slice(start, end),
			start,
		}
	}

	/** 
	 * Parse for partial tokens at offset.
	 * Note this fails when located inside of a string like literals.
	 */
	abstract parsePartialTokens(offset: number): Iterable<AnyToken<T>>
}