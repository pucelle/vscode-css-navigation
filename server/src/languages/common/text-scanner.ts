import {TextDocument} from 'vscode-languageserver-textdocument'


export class TextScanner {

	protected document: TextDocument
	protected text: string
	protected offset: number

	constructor(document: TextDocument, offset: number) {
		this.document = document
		this.text = document.getText()
		this.offset = offset - 1
	}

	/** Is in the end of left. */
	protected isLeftEOS(): boolean {
		return this.offset === -1
	}

	/** Is in the end of right */
	protected isRightEOS(): boolean {
		return this.offset === this.text.length
	}

	/** Read current char, and moves to left. */
	protected readLeft(): string {
		return this.text.charAt(this.offset--)
	}

	/** Read current char, and moves to right. */
	protected readRight(): string {
		return this.text.charAt(this.offset++)
	}

	/** Peek next char in the left. */
	protected peekLeft(forward: number = 0): string {
		return this.text.charAt(this.offset - forward)
	}

	/** Peek next char in the right. */
	protected peekRight(backward: number = 0): string {
		return this.text.charAt(this.offset + backward)
	}

	/** Peek next char in the left, skips white spaces. */
	protected peekLeftSkipWhiteSpaces(forward: number = 0): string {
		let offset = this.offset
		let forwardCount = 0

		while (!this.isLeftEOS()) {
			let char = this.text.charAt(offset)
			if (!/\s/.test(char)) {
				if (forwardCount === forward) {
					return char
				}
				forwardCount++
			}
			offset--
		}

		return ''
	}

	/** Peek next char in the left, skips white spaces. */
	protected peekRightSkipWhiteSpaces(backward: number = 0): string {
		let offset = this.offset
		let forwardCount = 0

		while (!this.isRightEOS()) {
			let char = this.text.charAt(offset)
			if (!/\s/.test(char)) {
				if (forwardCount === backward) {
					return char
				}
				forwardCount++
			}
			offset++
		}

		return ''
	}

	/** Moves left. */
	protected moveLeft(forward: number = 1) {
		this.offset -= forward
	}

	/** Moves right. */
	protected moveRight(backward: number = 1) {
		this.offset += backward
	}

	/** Read word at moves cursor to left word boundary. */
	protected readLeftWord(): string {
		let endPosition = this.offset + 1

		while (endPosition < this.text.length) {
			let char = this.text[endPosition]
			if (/[\w\-]/.test(char)) {
				endPosition++
			}
			else {
				break
			}
		}

		while (!this.isLeftEOS()) {
			let char = this.peekLeft()
			if (/[\w\-]/.test(char)) {
				this.moveLeft()
			}
			else {
				break
			}
		}
		
		return this.text.slice(this.offset + 1, endPosition)
	}

	/** Read word at moves cursor to right word boundary. */
	protected readRightWord(): string {
		let startPosition = this.offset - 1

		while (startPosition >= 0) {
			let char = this.text[startPosition]
			if (/[\w\-]/.test(char)) {
				startPosition--
			}
			else {
				break
			}
		}

		while (!this.isRightEOS()) {
			let char = this.peekRight()
			if (/[\w\-]/.test(char)) {
				this.moveRight()
			}
			else {
				break
			}
		}
		
		return this.text.slice(startPosition + 1, this.offset)
	}

	/** Read chars to left until meet any of `chars`. */
	protected readLeftUntil(chars: string[], maxCharCount: number = 1024): string {
		let endPosition = this.offset
		let count = 0

		while (!this.isLeftEOS() && count++ < maxCharCount) {
			let char = this.readLeft()
			if (chars.includes(char)) {
				break
			}
		}

		return this.text.slice(this.offset + 1, endPosition + 1)
	}

	/** Read chars to right until meet any of `chars`. */
	protected readRightUntil(chars: string[], maxCharCount: number = 1024): string {
		let startPosition = this.offset
		let count = 0

		while (!this.isRightEOS() && count++ < maxCharCount) {
			let char = this.readRight()
			if (chars.includes(char)) {
				break
			}
		}

		return this.text.slice(startPosition, this.offset)
	}
	
	/** Skip white spaces in left position. */
	protected skipLeftWhiteSpaces() {
		while (!this.isLeftEOS()) {
			let char = this.peekLeft()
			if (/\s/.test(char)) {
				this.moveLeft()
			}
			else {
				break
			}
		}
	}

	/** Skip white spaces in right position. */
	protected skipRightWhiteSpaces() {
		while (!this.isRightEOS()) {
			let char = this.peekRight()
			if (/\s/.test(char)) {
				this.moveRight()
			}
			else {
				break
			}
		}
	}
}
