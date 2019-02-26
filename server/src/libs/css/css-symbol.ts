import {TextDocument, Range, SymbolInformation, SymbolKind, Location} from 'vscode-languageserver'
import {SimpleSelector} from '../html/html-service'
import {CSSSymbolParser} from './css-symbol-parser'


export interface NamedRange {
	names: {full: string, main: string}[]
	range: Range
}

export class CSSSymbol {

	private languageId: string
	private uri: string
	private ranges: NamedRange[]

	static create(document: TextDocument): CSSSymbol {
		return new CSSSymbolParser(document).parse()
	}

	constructor(document: TextDocument, ranges: NamedRange[]) {
		this.languageId = document.languageId
		this.uri = document.uri
		this.ranges = ranges
	}

	findLocationsMatchSelector(selector: SimpleSelector): Location[] {
		let locations: Location[] = []
		let selectorRaw = selector.raw

		for (let range of this.ranges) {
			let isMatch = range.names.some(({main}) => {
				return main === selectorRaw
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

	
	//have match when left word boundary match
	isMatchQuery(selector: string, query: string): boolean {
		let lowerSelector = selector.toLowerCase()
		let index = lowerSelector.indexOf(query)

		if (index === -1) {
			return false
		}

		if (index === 0) {
			return true
		}

		//@abc match query ab
		if (!/[a-z]/.test(query[0])) {
			return true
		}

		//abc not match query bc, but ab-bc does
		while (/[a-z]/.test(lowerSelector[index - 1])) {
			lowerSelector = lowerSelector.slice(index + query.length)
			index = lowerSelector.indexOf(query)

			if (index === -1) {
				return false
			}
		}

		return true
	}

	findCompletionMatchSelector(selector: SimpleSelector): string[] {
		let labelSet: Set<string> = new Set()
		let selectorRaw = selector.raw

		for (let range of this.ranges) {
			for (let {main} of range.names) {
				if (main.startsWith(selectorRaw)) {
					let label = selector.value + main.slice(selectorRaw.length)
					labelSet.add(label)
				}
			}
		}

		return [...labelSet.values()]
	}
}
