import * as path from 'path'

import {
	TextDocument,
	SymbolInformation,
	Location,
	Range,
	Position
} from 'vscode-languageserver'

import {
	getCSSLanguageService,
	getSCSSLanguageService,
	getLESSLanguageService,
	LanguageService,
	Stylesheet
} from 'vscode-css-languageservice'

import {FileTracker, TrackMapItem} from './file-tracker'
import {SimpleSelector} from './html-service'


namespace CSSLanguageService {

	let languageServiceGenerator: {[id: string]: Function} = {
		css: getCSSLanguageService,
		scss: getSCSSLanguageService,
		less: getLESSLanguageService
	}

	let initializedLanguageServices: {[id: string]: LanguageService | null} = {
		css: null,
		scss: null,
		less: null
	}

	export function getFromLanguageId(languageId: string): LanguageService {
		if (initializedLanguageServices[languageId]) {
			return initializedLanguageServices[languageId]!
		}

		if (!languageServiceGenerator[languageId]) {
			languageId = 'css'
			console.log(`Language "${languageId}" is not a declared css language, using css service instead.`)
		}

		return initializedLanguageServices[languageId] = languageServiceGenerator[languageId]()
	}
}


export class StylesheetMap extends FileTracker {

	stylesheets: Map<string, Stylesheet> = new Map()

	protected onTrack(filePath: string, item: TrackMapItem) {}

	protected onExpired(filePath: string, item: TrackMapItem) {
		this.stylesheets.delete(filePath)
	}

	protected onUnTrack(filePath: string, item: TrackMapItem) {
		this.stylesheets.delete(filePath)
	}

	async onUpdated(filePath: string, item: TrackMapItem) {
		if (item.document) {
			this.stylesheets.set(filePath,this.loadStyleFromDocument(item.document))
		}
	}

	private loadStyleFromDocument(document: TextDocument): Stylesheet {
		let languageService = CSSLanguageService.getFromLanguageId(document.languageId)
		let stylesheet = languageService.parseStylesheet(document)
		return stylesheet
	}

	async findDefinitionMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		let symbols = await this.findSymbolsMatchSelector(selector)
		let locations = symbols.map(symbol => symbol.location)
		return locations
	}

	async findSymbolsMatchSelector(selector: SimpleSelector): Promise<SymbolInformation[]> {
		await this.beFresh()
		
		let matchedSymbols: SymbolInformation[] = []

		for (let [document, stylesheet] of this.iterateDocumentAndStylesheet()) {
			let {uri, languageId} = document
			let symbols = CSSLanguageService.getFromLanguageId(languageId).findDocumentSymbols(document, stylesheet)
			let matcher = new SelectorMatcher(uri)

			matchedSymbols.push(...matcher.findSymbolsMatchSelector(symbols, selector))
		}

		return matchedSymbols
	}

	*iterateDocumentAndStylesheet(): IterableIterator<[TextDocument, Stylesheet]> {
		for (let [filePath, {document}] of this.map.entries()) {
			if (!document) {
				continue
			}

			let stylesheet = this.stylesheets.get(filePath)
			if (!stylesheet) {
				continue
			}

			yield [document, stylesheet]
		}
	}
	
	async findSymbolsMatchQuery(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let matchedSymbols: SymbolInformation[] = []

		for (let [document, stylesheet] of this.iterateDocumentAndStylesheet()) {
			let {uri, languageId} = document
			let symbols = CSSLanguageService.getFromLanguageId(languageId).findDocumentSymbols(document, stylesheet)
			let matcher = new SelectorMatcher(uri)

			matchedSymbols.push(...matcher.findSymbolsMatchQuery(symbols, query))
		}

		return matchedSymbols
	}
}


class SelectorMatcher {

	private supportsNesting: boolean

	constructor(uri: string) {
		this.supportsNesting = this.isURISupportsNesting(uri)
	}

	private isURISupportsNesting(uri: string) {
		return ['scss', 'less'].includes(path.extname(uri).slice(1).toLowerCase())
	}

	findSymbolsMatchSelector(symbols: SymbolInformation[], selector: SimpleSelector): SymbolInformation[] {
		let matchedSymbols: SymbolInformation[] = []
		let nestingMatcher: NestingMatcher | null = null

		if (this.supportsNesting) {
			nestingMatcher = new NestingMatcher(selector.raw)
		}

		for (let symbol of symbols) {
			let symbolSelector = symbol.name
			let matchedSymbol: SymbolInformation | null = null

			if (!MatchHelper.isSimpleSelector(symbolSelector)) {
				continue
			}

			if (selector.type === SimpleSelector.Type.Tag) {
				if (MatchHelper.isSelectorBeStartOfTheRightMostDescendant(selector.raw, symbolSelector)) {
					matchedSymbol = symbol
				}
			}
			else if (symbolSelector.includes(selector.raw) && MatchHelper.isSelectorBeStartOfTheRightMostDescendant(selector.raw, symbolSelector)) {
				matchedSymbol = symbol
			}

			if (!matchedSymbol && nestingMatcher) {
				let nestingMatched = nestingMatcher.addSymbolAndTestIfMatch(symbol)
				if (nestingMatched) {
					matchedSymbol = symbol
				}
			}

			if (matchedSymbol) {
				matchedSymbols.push(matchedSymbol)
			}
		}

		return matchedSymbols
	}

	/*
	query 'p' will match:
		p* as tag name
		.p* as class name
		#p* as id
	and may more decorated selectors follow
	*/
	findSymbolsMatchQuery(symbols: SymbolInformation[], query: string): SymbolInformation[] {
		let matchedSymbols: SymbolInformation[] = []
		let nestingMatcher: NestingQueryMatcher | null = null
		let lowerQuery = query.toLowerCase()

		if (this.supportsNesting) {
			nestingMatcher = new NestingQueryMatcher(lowerQuery)
		}

		for (let symbol of symbols) {
			let matchedSymbol: SymbolInformation | null = null

			if (MatchHelper.isMatchQuery(symbol.name, lowerQuery)) {
				matchedSymbol = symbol
			}

			//still need to add although symbol matched above
			if (nestingMatcher) {
				let nestingMatched = nestingMatcher.addSymbolAndTestIfMatch(symbol)
				if (!matchedSymbol && nestingMatched) {
					matchedSymbol = symbol
				}
			}

			if (matchedSymbol) {
				matchedSymbols.push(matchedSymbol)
			}
		}

		return matchedSymbols
	}
}


namespace MatchHelper {

	//avoid parsing @keyframes anim-name as tag name
	export function isSimpleSelector(selector: string): boolean {
		return selector[0] !== '@'
	}

	//the descendant combinator used to split ancestor and descendant: space > + ~ >> ||
	export function isSelectorBeStartOfTheRightMostDescendant(selector: string, symbolSelector: string): boolean {
		let descendantRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^ >+~])+$/
		let match = symbolSelector.match(descendantRE)
		if (!match) {
			return false
		}

		let descendant = match[0]
		return isSelectorBeStartOf(selector, descendant)
	}

	/*
	the selector should already be the start of the right most descendant
	e.g., '.a' matches
		.a[...]
		.a:actived
		.a::before
		.a.b
	*/
	export function isSelectorBeStartOf(selector: string, symbolSelector: string) {
		if (!symbolSelector.startsWith(selector)) {
			return false
		}

		if (symbolSelector === selector) {
			return true
		}

		//.a is not the start of .a-b
		let isAnotherSelector = /[\w-]/.test(symbolSelector.charAt(selector.length))
		return !isAnotherSelector
	}

	//only compare end position since ranges already been ordered
	export function isRangeIn(range: Range, widerRange: Range): boolean {
		if (widerRange.end.line > range.end.line) {
			return true
		}
		
		if (widerRange.end.line === range.end.line && widerRange.end.character > range.end.character) {
			return true
		}

		return false
	}

	//have match when left word boundary match
	export function isMatchQuery(selector: string, query: string): boolean {
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

}


interface NestingSelector {
	selector: string
	range: Range
}

class NestingMatcher {

	private nestingSelectors: NestingSelector[]

	private lastRejectedRange: Range | null = null

	constructor(rawSelector: string) {
		this.nestingSelectors = [{
			selector: rawSelector,
			range: Range.create(Position.create(0, 0), Position.create(Infinity, 0))
		}]
	}

	addSymbolAndTestIfMatch(symbol: SymbolInformation): boolean {
		if (this.isInRejectedRange(symbol.location.range)) {
			return false
		}

		this.popOutOfRangeNestingSelectors(symbol.location.range)

		let symbolSelector = symbol.name
		let expectedSelector = this.nestingSelectors[this.nestingSelectors.length - 1].selector

		if (symbolSelector.includes(expectedSelector) && MatchHelper.isSelectorBeStartOfTheRightMostDescendant(expectedSelector, symbolSelector)) {
			return true
		}

		//when symbol '.a' meet query '.a-b', generate query '&-b'
		else if (expectedSelector.startsWith(symbolSelector)) {
			this.nestingSelectors.push({
				selector: '&' + expectedSelector.slice(symbolSelector.length),
				range: symbol.location.range
			})
		}

		//if symbol '.c' not match '.a-b', all the following symbols in range will be skipped
		else {
			this.lastRejectedRange = symbol.location.range
		}

		return false
	}

	private isInRejectedRange(range: Range) {
		if (this.lastRejectedRange) {
			if (MatchHelper.isRangeIn(range, this.lastRejectedRange)) {
				return true
			}
	
			this.lastRejectedRange = null
		}

		return false
	}
	
	private popOutOfRangeNestingSelectors(range: Range) {
		while (this.nestingSelectors.length > 1) {
			let {range: lastRange} = this.nestingSelectors[this.nestingSelectors.length - 1]
			let isSymbolInLastRange = MatchHelper.isRangeIn(range, lastRange)

			if (isSymbolInLastRange) {
				break
			}
			else {
				this.nestingSelectors.pop()
			}
		}
	}
}


class NestingQueryMatcher {

	query: string	//lowercase already

	nestingSelectors: NestingSelector[] = []

	constructor(query: string) {
		this.query = query
	}

	addSymbolAndTestIfMatch(symbol: SymbolInformation) {
		this.popOutOfRangeNestingSelectors(symbol.location.range)

		let symbolSelector = symbol.name
		if (symbolSelector[0] === '&' && this.nestingSelectors.length > 0) {
			symbolSelector = this.nestingSelectors[this.nestingSelectors.length - 1].selector + symbolSelector.slice(1)
		}

		this.nestingSelectors.push({
			selector: symbolSelector,
			range: symbol.location.range
		})

		if (MatchHelper.isMatchQuery(symbolSelector, this.query)) {
			symbol.name = symbolSelector
			return true
		}

		return false
	}

	private popOutOfRangeNestingSelectors(range: Range) {
		while (this.nestingSelectors.length > 0) {
			let {range: lastRange} = this.nestingSelectors[this.nestingSelectors.length - 1]
			let isSymbolInLastRange = MatchHelper.isRangeIn(range, lastRange)

			if (isSymbolInLastRange) {
				break
			}
			else {
				this.nestingSelectors.pop()
			}
		}
	}
}
