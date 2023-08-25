import {SymbolInformation, SymbolKind, Position, LocationLink, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {CSSNamedRange, parseCSSLikeOrSassRanges} from './range-parsers'
import {CSSScanner, CSSSelectorResults} from './css-scanner'
import {URI} from 'vscode-uri'
import {resolveImportPath} from '../../helpers/file'
import {ImportPath} from '../common/import-path'


/** Gives CSS service for one CSS file. */
export class CSSService {

	private uri: string
	private ranges: CSSNamedRange[]
	private importPaths: string[]

	constructor(document: TextDocument, ranges: CSSNamedRange[], importPaths: string[]) {
		this.uri = document.uri
		this.ranges = ranges
		this.importPaths = importPaths
	}

	/** Get resolved imported css paths from `@import ...`. */
	async getResolvedImportPaths(): Promise<string[]> {
		if (this.importPaths.length > 0) {
			let filePaths: string[] = []

			for (let importPath of this.importPaths) {
				let filePath = await resolveImportPath(URI.parse(this.uri).fsPath, importPath)
				if (filePath) {
					filePaths.push(filePath)
				}
			}
			
			return filePaths
		}
		else {
			return []
		}
	}

	/** Find definitions match one selector. */
	findDefinitionsMatchSelector(selector: SimpleSelector): LocationLink[] {
		let locations: LocationLink[] = []
		let selectorRaw = selector.raw

		for (let range of this.ranges) {
			let isMatch = range.names.some(({mains}) => {
				return mains !== null && mains.includes(selectorRaw)
			})

			if (isMatch) {
				let targetRange = range.range
				let selectionRange = Range.create(targetRange.start, targetRange.start)
				let fromRange = selector.toRange()

				locations.push(LocationLink.create(this.uri, range.range, selectionRange, fromRange))
			}
		}

		return locations
	}

	/**
	 * Query symbols from a wild match query string.
     *
	 * Query string 'p' will match:
	 *	p* as tag name
	 *	.p* as class name
	 *	#p* as id
	 * and may have more decorated selectors followed.
	 */
	findSymbolsMatchQuery(query: string): SymbolInformation[] {
		let symbols: SymbolInformation[] = []
		let lowerQuery = query.toLowerCase()

		for (let range of this.ranges) {
			for (let {full} of range.names) {
				let isMatch = this.isMatchQuery(full, lowerQuery)
				if (isMatch) {
					symbols.push(SymbolInformation.create(
						full,
						SymbolKind.Class,
						range.range,
						this.uri
					))
				}
			}
		}

		return symbols
	}
	
	/** Test if one selector match a symbol query string, they will match when left word boundaries matched. */
	private isMatchQuery(selector: string, query: string): boolean {
		let lowerSelector = selector.toLowerCase()
		let index = lowerSelector.indexOf(query)

		if (index === -1) {
			return false
		}

		//match at start position
		if (index === 0) {
			return true
		}

		//if search only 1 character, must match at start word boundary
		if (query.length === 1) {
			let charactersBeforeMatch = selector.slice(0, index)
			let hasNoWordCharacterBeforeMatch = !/[a-z]/.test(charactersBeforeMatch)
			return hasNoWordCharacterBeforeMatch
		}

		//starts with a not word characters
		if (!/[a-z]/.test(query[0])) {
			return true
		}

		//'abc' not match query 'bc', but 'ab-bc' matches
		while (/[a-z]/.test(lowerSelector[index - 1])) {
			lowerSelector = lowerSelector.slice(index + query.length)
			index = lowerSelector.indexOf(query)

			if (index === -1) {
				return false
			}
		}

		return true
	}

	/** Find completion label pieces from selector. */
	findCompletionLabelsMatchSelector(selector: SimpleSelector): string[] {
		let labelSet: Set<string> = new Set()
		let selectorRaw = selector.raw

		for (let range of this.ranges) {
			for (let {mains} of range.names) {
				if (mains === null) {
					continue
				}

				let main = mains.find(main => main.startsWith(selectorRaw))
				if (main) {
					let label = main.slice(1)	//only id or class selector, no tag selector provided
					labelSet.add(label)
				}
			}
		}

		return [...labelSet.values()]
	}
}


/** Global help functions of CSSService. */
export namespace CSSService {
	
	/** Create a CSSService from a CSS document. */
	export function create(document: TextDocument, includeImportedFiles: boolean): CSSService {
		let {ranges, importPaths} = parseCSSLikeOrSassRanges(document)

		if (!includeImportedFiles) {
			importPaths = []
		}

		return new CSSService(document, ranges, importPaths)
	}
	
	/** Check if CSS language supports nesting. */
	export function isLanguageSupportsNesting(languageId: string): boolean {
		let supportedNestingLanguages = ['less', 'scss', 'sass']
		return supportedNestingLanguages.includes(languageId)
	}

	/** 
	 * Get current selector from a CSS document and the cursor position.
	 * May return multiple selectors because of nesting.
	 */
	export function getSimpleSelectorsAt(document: TextDocument, position: Position): SimpleSelector[] | null {
		let offset = document.offsetAt(position)
		return new CSSScanner(document, offset).scanForSelectors()
	}

	/** 
	 * Get current selector and raw text from a CSS document and the cursor position.
	 * May return multiple selectors because of nesting.
	 */
	export function getSimpleSelectorResultsAt(document: TextDocument, position: Position): CSSSelectorResults | null	{
		let offset = document.offsetAt(position)
		return new CSSScanner(document, offset).scanForSelectorResults()
	}

	/** If click `goto definition` at a `<link href="...">` or `<style src="...">`. */
	export async function getImportPathAt(document: TextDocument, position: Position): Promise<ImportPath | null> {
		let offset = document.offsetAt(position)
		return await (new CSSScanner(document, offset).scanForImportPath())
	}
}