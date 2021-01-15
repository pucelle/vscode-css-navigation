import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import {CSSService} from './css-service'
import {CSSNamedRange, CSSRangeParser} from './css-range-parser'
import {firstMatch} from '../../helpers/utils'


export class CSSScanner extends TextScanner {

	private supportsNesting: boolean
	private startOffset: number

	constructor(document: TextDocument, offset: number) {
		super(document, offset)
		this.supportsNesting = CSSService.isLanguageSupportsNesting(document.languageId)
		this.startOffset = offset
	}

	/** Scan CSS selector for a CSS document from specified offset. */
	scanForSelector(): SimpleSelector[] | null {
		//when mouse in '|&-a', check if the next char is &
		let nextChar = this.peekLeft(-1)
		if (nextChar === '#' || nextChar === '.' || this.supportsNesting && nextChar === '&') {
			this.moveRight()
		}

		let word = this.readLeftWord()
		if (!word) {
			return null
		}

		let char = this.readLeft()
		if (char === '.' || char === '#') {
			let selector = SimpleSelector.create(char + word)
			return selector ? [selector] : null
		}

		if (this.supportsNesting && char === '&') {
			return this.parseAndGetSelectors(word)
		}

		return null
	}

	/** Parse whole ranges for document and get selector. */
	private parseAndGetSelectors(word: string): SimpleSelector[] | null {
		let {ranges} = new CSSRangeParser(this.document).parse()
		let currentRange: CSSNamedRange | undefined
		let selectorIncludedParentRange: CSSNamedRange | undefined

		// Binary searching should be a little better, but not help much
		for (let i = 0; i < ranges.length; i++) {
			let range = ranges[i]
			let start = this.document.offsetAt(range.range.start)
			let end = this.document.offsetAt(range.range.end)
			
			// Is a ancestor and has selector
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

	/** Checks whether range having a selector. */
	private isRangeHaveSelector(range: CSSNamedRange): boolean {
		return range.names.some(({mains}) => mains !== null)
	}

	/** Scan for relative import path. */
	scanForImportPath() {
		this.readLeftUntil([';'])
		this.moveRight()

		let code = this.readRightUntil([';'])
		let re = /@import\s*['"](.*?)['"]/

		return firstMatch(code, re)
	}
}
