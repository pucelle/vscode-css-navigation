import * as path from 'path'
import {TextDocument, SymbolInformation, SymbolKind, Location, Position} from 'vscode-languageserver'
import {SimpleSelector} from '../common/simple-selector'
import {NamedRange, CSSRangeParser} from './css-range-parser'
import {CSSSimpleSelectorScanner} from './css-scanner'
import {readText} from '../../libs/file'
import URI from 'vscode-uri'


export class CSSService {

	private uri: string
	private ranges: NamedRange[]

	importPaths: string[]

	constructor(document: TextDocument, ranges: NamedRange[], importPaths: string[]) {
		this.uri = document.uri
		this.ranges = ranges
		this.importPaths = importPaths
	}

	findDefinitionsMatchSelector(selector: SimpleSelector): Location[] {
		let locations: Location[] = []
		let selectorRaw = selector.raw

		for (let range of this.ranges) {
			let isMatch = range.names.some(({mains}) => {
				return mains !== null && mains.includes(selectorRaw)
			})

			if (isMatch) {
				locations.push(Location.create(this.uri, range.range))
			}
		}

		return locations
	}

	/*
	query 'p' will match:
		p* as tag name
		.p* as class name
		#p* as id
	and may more decorated selectors follow
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

	
	//match when left word boundary match
	isMatchQuery(selector: string, query: string): boolean {
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


export namespace CSSService {
	
	export function create(document: TextDocument): CSSService {
		let {ranges, importPaths} = new CSSRangeParser(document).parse()
		return new CSSService(document, ranges, importPaths)
	}

	export function isLanguageSupportsNesting(languageId: string): boolean {
		let supportedNestingLanguages = ['less', 'scss']
		return supportedNestingLanguages.includes(languageId)
	}

	export function getSimpleSelectorAt(document: TextDocument, position: Position): SimpleSelector[] | null {
		let offset = document.offsetAt(position)
		return new CSSSimpleSelectorScanner(document, offset).scan()
	}

	export async function createFromFilePath(filePath: string): Promise<CSSService | null> {
		let extension = path.extname(filePath).slice(1)
		try{
			let text = await readText(filePath)
			let cssDocument = TextDocument.create(URI.file(filePath).toString(), extension, 1, text)
			return CSSService.create(cssDocument)
		}
		catch {
			return null
		}
	}
}