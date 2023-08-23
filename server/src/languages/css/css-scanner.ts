import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import {CSSDeclarationRange} from './range-parsers/css-like'
import {resolveImportPath} from '../../helpers/file'
import {URI} from 'vscode-uri'
import {parseCSSLikeOrSassRanges} from './range-parsers'
import {CSSService} from './css-service'


export interface CSSSelectorResults {
	selectors: SimpleSelector[]
	parentSelectors: SimpleSelector[] | null
	raw: string
	startIndex: number
}


export class CSSScanner extends TextScanner {

	private supportsNesting: boolean
	private startOffset: number

	constructor(document: TextDocument, offset: number) {
		super(document, offset)
		this.supportsNesting = CSSService.isLanguageSupportsNesting(document.languageId)
		this.startOffset = offset
	}

	/** Scan CSS selectors in a CSS document from specified offset. */
	scanForSelectorResults(): CSSSelectorResults | null {

		// Not match:
		// `:property value`.
		// `:` or `::` presudo, which also should be excluded.
		// selector parts like `[...]`, `(...)`, doesn't handle multiple bracket nesting `(())`.
		let notMatch = this.match(/(:\s*\S+|:.+;|::\s*\S+|\[[^\]]*?\]|\([^)]*?\))/g)
		if (notMatch) {
			return null
		}

		// Tag, or #id,.class, &-suffix.
		let match = this.match(/([\w-]+|[#.&][\w-]*)/g)
		if (!match) {
			return null
		}

		let mayIdentifier = match.text[0]
		let selectors: SimpleSelector[] = []
		let parentSelectors: SimpleSelector[] | null = null

		if (mayIdentifier === '.' || mayIdentifier === '#') {
			let selector = SimpleSelector.create(match.text, match.index)
			if (selector) {
				selectors.push(selector)
			}
		}

		else if (this.supportsNesting && mayIdentifier === '&') {
			parentSelectors = this.parseParentSelectors()

			if (parentSelectors) {
				selectors.push(...this.makeReferenceSelectors(parentSelectors, match.text, match.index))
			}
		}

		else {
			let selector = SimpleSelector.create(match.text, match.index)!
			if (selector) {
				selectors.push(selector)
			}
		}

		// `selectors` may be empty.
		return {
			selectors,
			parentSelectors,
			raw: match.text,
			startIndex: match.index
		}
	}

	/** Scan CSS selectors in a CSS document from specified offset. */
	scanForSelectors(): SimpleSelector[] | null {
		return this.scanForSelectorResults()?.selectors || null
	}

	/** Parse whole ranges for document and get selector. */
	private makeReferenceSelectors(parentSelectors: SimpleSelector[], rawReferenceText: string, startIndex: number): SimpleSelector[] {
		return parentSelectors.map(s => {
			return SimpleSelector.create(s.raw + rawReferenceText.slice(1), startIndex)!
		})
	}

	/** Parse whole ranges for document and get selector. */
	private parseParentSelectors(): SimpleSelector[] | null {
		let {ranges} = parseCSSLikeOrSassRanges(this.document)
		let currentRange: CSSDeclarationRange | undefined
		let closestParentRange: CSSDeclarationRange | undefined

		// Binary searching should be better, but not help much.
		for (let i = 0; i < ranges.length; i++) {
			let range = ranges[i]
			let start = this.document.offsetAt(range.range.start)
			let end = this.document.offsetAt(range.range.end)
			
			// Is an ancestor and has selector.
			if (this.startOffset >= start && this.startOffset < end) {
				if (currentRange && this.isRangeHaveSelector(currentRange)) {
					closestParentRange = currentRange
				}
				currentRange = range
			}

			if (this.startOffset < start) {
				break
			}
		}

		// May `.a{.b}`, `.b` doesn't make range.
		closestParentRange = closestParentRange || currentRange

		if (!closestParentRange) {
			return null
		}

		let selectors = []

		for (let {full} of closestParentRange.names) {
			if (full[0] === '.' || full[0] === '#') {
				let selector = SimpleSelector.create(full, 0)
				if (selector) {
					selectors.push(selector)
				}
			}
		}

		return selectors
	}

	/** Checks whether the range have a selector. */
	private isRangeHaveSelector(range: CSSDeclarationRange): boolean {
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
