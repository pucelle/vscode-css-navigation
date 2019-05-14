import {TextDocument} from 'vscode-languageserver'


export class ForwardScanner {

	protected document: TextDocument
	protected text: string
	protected offset: number

	constructor(document: TextDocument, offset: number) {
		this.document = document
		this.text = document.getText()
		this.offset = offset - 1
	}

	protected eos(): boolean {
		return this.offset === -1
	}

	protected read(): string {
		return this.text.charAt(this.offset--)
	}

	protected peek(forward: number = 0): string {
		return this.text.charAt(this.offset - forward)
	}

	protected peekSkipWhiteSpaces(forward: number = 0): string {
		let offset = this.offset
		let forwardCount = 0

		while (offset >= 0) {
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

	protected back() {
		this.offset++
	}

	protected forward() {
		this.offset--
	}

	// Read word at when cursor at the end of the word: `word[HERE]`.
	protected readWord(): string {
		let startPosition = this.offset

		while (!this.eos()) {
			let char = this.read()
			if (!/[\w\-]/.test(char)) {
				this.back()
				break
			}
		}
		
		return this.text.slice(this.offset + 1, startPosition + 1)
	}

	// Read word at when cursor at the middle of the word: `wo[HERE]rd`.
	protected readWholeWord(): string {
		let startPosition = this.offset + 1

		while (startPosition < this.text.length) {
			let char = this.text[startPosition]
			if (/[\w\-]/.test(char)) {
				startPosition++
			}
			else {
				break
			}
		}

		this.readWord()
		
		return this.text.slice(this.offset + 1, startPosition)
	}

	// Include the until char
	protected readUntil(chars: string[], maxCharCount: number = 1024): [string, string] {
		let startPosition = this.offset
		let count = 0
		let untilChar = ''

		while (!this.eos() && count++ < maxCharCount) {
			let char = this.read()
			if (chars.includes(char)) {
				untilChar = char
				break
			}
		}

		return [untilChar, this.text.slice(this.offset + 1, startPosition + 1)]
	}

	protected skipWhiteSpaces() {
		while (!this.eos()) {
			let char = this.read()
			if (!/\s/.test(char)) {
				this.back()
				break
			}
		}
	}
}
