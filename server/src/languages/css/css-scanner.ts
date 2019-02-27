import {TextDocument} from 'vscode-languageserver'
import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'
import {CSSService} from './css-service'
import {NamedRange, CSSRangeParser} from './css-range-parser'


export class CSSSimpleSelectorScanner extends ForwardScanner {

	private document: TextDocument
	private supportsNesting: boolean

	constructor(document: TextDocument, offset: number) {
		super(document.getText(), offset)
		this.document = document
		this.supportsNesting = CSSService.isLanguageSupportsNesting(document.languageId)
	}

	public scan(): SimpleSelector[] | null {
		//when mouse in '|&-a', check if the next char is &
		if (this.supportsNesting && this.peekNext() === '&') {
			this.back()
		}

		let word = this.readWholeWord()
		if (!word) {
			return null
		}

		let char = this.read()
		if (char === '.' || char === '#') {
			let selector = SimpleSelector.create(char + word)
			return selector ? [selector] : null
		}

		if (this.supportsNesting && char === '&') {
			return this.parseAndGetSelectors(word)
		}

		return null
	}

	parseAndGetSelectors(word: string): SimpleSelector[] | null {
		let parser = new CSSRangeParser(this.document)
		let ranges = parser.parse()
		let currentRange: NamedRange | undefined
		let parentRange: NamedRange | undefined

		//binary searching should be a little better, but not help much
		for (let i = 0; i < ranges.length; i++) {
			let range = ranges[i]
			let start = this.document.offsetAt(range.range.start)
			let end = this.document.offsetAt(range.range.end)
			
			//is ancestor
			if (this.offset >= start && this.offset < end) {
				currentRange = ranges[i]
				parentRange = currentRange
			}

			if (this.offset < start) {
				break
			}
		}

		if (!parentRange) {
			return null
		}

		let selectors = []
		for (let {full} of parentRange.names) {
			if (full[0] === '.' || full[0] === '#') {
				let selector = SimpleSelector.create(full + word)
				if (selector) {
					selectors.push(selector)
				}
			}
		}

		return selectors
	}
}
