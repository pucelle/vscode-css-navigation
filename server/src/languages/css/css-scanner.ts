import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import {CSSDeclarationRange} from './range-parsers/css-like'
import {resolveImportPath} from '../../helpers/file'
import {URI} from 'vscode-uri'
import {parseCSSLikeOrSassRanges} from './range-parsers'
import {CSSService} from './css-service'
import * as path from 'path'
import {ImportPath} from '../common/import-path'


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
			let selector = SimpleSelector.create(match.text, match.index, this.document)
			if (selector) {
				selectors.push(selector)
			}
		}

		else if (this.supportsNesting && mayIdentifier === '&') {
			parentSelectors = this.parseParentSelectors()

			if (parentSelectors) {
				let refText = match.text.slice(1)
				let mayIdentifier = match.text[1]

				// p {&.class {}}
				if (mayIdentifier === '.' || mayIdentifier === '#') {
					parentSelectors = null
					selectors.push(SimpleSelector.create(refText, match.index, this.document)!)
				}

				// .p {&-class {}}
				else {
					selectors.push(...this.makeReferenceSelectors(parentSelectors, refText, match.index))
				}
			}
		}

		else {
			let selector = SimpleSelector.create(match.text, match.index, this.document)!
			if (selector) {
				selectors.push(selector)
			}
		}

		// `selectors` may be empty.
		return {
			selectors,
			parentSelectors,
			raw: match.text,
			startIndex: match.index,
		}
	}

	/** Scan CSS selectors in a CSS document from specified offset. */
	scanForSelectors(): SimpleSelector[] | null {
		return this.scanForSelectorResults()?.selectors || null
	}

	/** Parse whole ranges for document and get selector. */
	private makeReferenceSelectors(parentSelectors: SimpleSelector[], refText: string, startIndex: number): SimpleSelector[] {
		return parentSelectors.map(s => {
			return SimpleSelector.create(s.raw + refText, startIndex, this.document)!
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
				let selector = SimpleSelector.create(full, 0, this.document)
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
	async scanForImportPath(): Promise<ImportPath | null> {
		let match = this.match(/@import\s*['"](.*?)['"]\s*;/g)
		
		if (match) {
			let currentPath = path.dirname(URI.parse(this.document.uri).fsPath)
			let importPath = await resolveImportPath(currentPath, match.text)

			if (importPath) {
				let startIndex = match.index
				let endIndex = startIndex + match.text.length

				return new ImportPath(importPath, startIndex, endIndex, this.document)
			}
		}
		
		return null
	}
}
