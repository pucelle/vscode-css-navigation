import {CSSService} from '../css-service'
import {CSSLikeRangeParser, Leaf} from './css-like'


/** Represent each line of sass document. */
interface SassLine {
	tabCount: number
	content: string
	startIndex: number
	endIndex: number
}


export class SassRangeParser extends CSSLikeRangeParser {

	protected supportedLanguages = ['sass']

	protected initializeNestingSupporting() {
		this.supportsNesting = CSSService.isLanguageSupportsNesting(this.document.languageId)
	}

	parse() {
		let text = this.document.getText()
		let ranges: Leaf[] = []
		let lines = this.parseToLines()

		for (let i = 0; i < lines.length; i++) {

			let {tabCount, content, startIndex, endIndex} = lines[i]
			let nextTabCount = i < lines.length - 1 ? lines[i + 1].tabCount : 0

			// |.class1
			//     color: red
			if (tabCount < nextTabCount) {
				let selector = content.trimRight().replace(/\s+/g, ' ')
				let names = this.parseSelectorNames(selector)

				this.current = this.newLeaf(names, startIndex)
				ranges.push(this.current!)
			}

			//     color: red
			// |.class1
			else if (tabCount > nextTabCount) {
				for (let j = 0; j < tabCount - nextTabCount; j++) {
					if (this.current) {
						this.current.rangeEnd = endIndex
						this.current = this.stack.pop()
					}
				}
			}

			// `@...` command in top level
			// parse `@import ...` to `this.importPaths`
			else if (content && !this.current) {
				this.parseSelectorNames(content)
			}
		}

		while (this.current) {
			if (this.current.rangeEnd === 0) {
				this.current.rangeEnd = text.length
			}
			this.current = this.stack.pop()
		}

		return {
			ranges: this.formatLeavesToRanges(ranges),
			importPaths: this.importPaths
		}
	}

	/** Check indent characters. */
	private checkIndentChars() {
		let text = this.document.getText()
		let re = /\n(\s+)/g
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let content = match[1]

			if (content === '\t' || content === '  ' || content === '    ') {
				return content
			}
		}

		return '\t'
	}

	/** Parse text to lines */
	private parseToLines(): SassLine[] {
		let text = this.document.getText()
		let indentChars = this.checkIndentChars()
		let re = /^(\s*)(.+)/gm
		let match: RegExpExecArray | null
		let lines: SassLine[] = []

		while (match = re.exec(text)) {
			let tabs = match[1] || ''
			let tabCount = Math.floor(tabs.length / indentChars.length)
			let content = match[2] || ''
			let endIndex = re.lastIndex
			let startIndex = endIndex - match[0].length + tabs.length

			if (!content) {
				continue
			}

			lines.push({
				tabCount,
				content,
				startIndex,
				endIndex,
			})
		}

		return lines
	}
}