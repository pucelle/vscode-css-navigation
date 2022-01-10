import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import {CSSService} from './css-service'
import {CSSNamedRange} from './range-parsers/css-like'
import {resolveImportPath} from '../../helpers/file'
import {URI} from 'vscode-uri'
import {parseCSSRange} from './range-parsers'


export class CSSScanner extends TextScanner {

	private supportsNesting: boolean
	private startOffset: number

	constructor(document: TextDocument, offset: number) {
		super(document, offset)
		this.supportsNesting = CSSService.isLanguageSupportsNesting(document.languageId)
		this.startOffset = offset
	}

	/** Scan CSS selectors in a CSS document from specified offset. */
	scanForSelector(): SimpleSelector[] | null {
		let match = this.match(/(?<identifier>[#.&])([\w-]+)/g)
		if (!match) {
			return null
		}

		let identifier = match.groups.identifier

		if (identifier === '.' || identifier === '#') {
			let selector = SimpleSelector.create(identifier + match.text, match.index)
			return selector ? [selector] : null
		}

		if (this.supportsNesting && identifier === '&') {
			return this.parseAndGetSelectors(match.text, match.index)
		}

		return null
	}

	/** Parse whole ranges for document and get selector. */
	private parseAndGetSelectors(word: string, wordLeftOffset: number): SimpleSelector[] | null {
		let {ranges} = parseCSSRange(this.document)
		let currentRange: CSSNamedRange | undefined
		let selectorIncludedParentRange: CSSNamedRange | undefined

		// Binary searching should be better, but not help much.
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
				let selector = SimpleSelector.create(full + word, wordLeftOffset)
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
	async scanForImportPath() {
		let importPath = this.match(/@import\s*['"](.*?)['"]\s*;/g)?.text
		if (importPath) {
			return await resolveImportPath(URI.parse(this.document.uri).fsPath, importPath)
		}
		
		return null
	}
}
