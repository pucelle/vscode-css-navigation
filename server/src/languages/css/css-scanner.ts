import {TextDocument} from 'vscode-languageserver'
import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'
import {CSSService} from './css-service'
import {NamedRange, CSSRangeParser} from './css-range-parser'


export class CSSSimpleSelectorScanner extends ForwardScanner {

	private supportsNesting: boolean
	private startOffset: number

	constructor(document: TextDocument, offset: number) {
		super(document, offset)
		this.supportsNesting = CSSService.isLanguageSupportsNesting(document.languageId)
		this.startOffset = offset
	}

	public scan(): SimpleSelector[] | null {
		//when mouse in '|&-a', check if the next char is &
		let nextChar = this.peek(-1)
		if (nextChar === '#' || nextChar === '.' || this.supportsNesting && nextChar === '&') {
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
		let selectorIncludedParentRange: NamedRange | undefined

		//binary searching should be a little better, but not help much
		for (let i = 0; i < ranges.length; i++) {
			let range = ranges[i]
			let start = this.document.offsetAt(range.range.start)
			let end = this.document.offsetAt(range.range.end)
			
			//is ancestor and has selector
			if (this.startOffset >= start && this.startOffset < end) {
				if (currentRange && this.isRangeHaveSelector(currentRange)) {
					selectorIncludedParentRange = currentRange
				}
				currentRange = range
			}

			if (this.startOffset < start) {
				break
			}
		}

		if (!selectorIncludedParentRange) {
			return null
		}

		let selectors = []
		for (let {full} of selectorIncludedParentRange.names) {
			if (full[0] === '.' || full[0] === '#') {
				let selector = SimpleSelector.create(full + word)
				if (selector) {
					selectors.push(selector)
				}
			}
		}

		return selectors
	}

	isRangeHaveSelector(range: NamedRange): boolean {
		return range.names.some(({mains}) => mains !== null)
	}
}
