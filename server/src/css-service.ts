import * as path from 'path'
import Uri from 'vscode-uri'

import {
	TextDocument,
	SymbolInformation,
	Location,
	Files,
	Range
} from 'vscode-languageserver'

import {
	getCSSLanguageService,
	getSCSSLanguageService,
	getLESSLanguageService,
	LanguageService,
	Stylesheet
} from 'vscode-css-languageservice'

import {
	SimpleSelector
} from './html-service'

import {
	readText,
	glob,
	getStat
} from './util'


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
			console.log(`Language "${languageId}" is not a declared css language, using css service instead.`)
		}

		return initializedLanguageServices[languageId] = languageServiceGenerator[languageId]()
	}
}


type StylesheetItem = {
	document: TextDocument | null
	stylesheet: Stylesheet | null
}

export class StylesheetMap {

	cssFileExtensions: string[]

	excludeGlobPatterns: string[]

	map: Map<string, StylesheetItem>

	fresh: boolean

	constructor(cssFileExtensions: string[], excludeGlobPatterns: string[]) {
		this.cssFileExtensions = cssFileExtensions
		this.excludeGlobPatterns = excludeGlobPatterns
		this.map = new Map()
		this.fresh = true
	}

	async trackPath(filePath: string) {
		let stat = await getStat(filePath)
				
		if (stat.isDirectory()) {
			this.trackFolder(filePath)
		}
		else if (stat.isFile()) {
			let extname = path.extname(filePath).slice(1).toLowerCase()
			if (this.cssFileExtensions.includes(extname)) {
				this.trackFile(filePath)
			}
		}
	}
	
	async trackFolder(folderPath: string) {
		let filePaths = await this.getCSSFilePathsInFolder(folderPath)

		for (let filePath of filePaths) {
			await this.trackFile(filePath)
		}
	}
	
	private async getCSSFilePathsInFolder(folderPath: string): Promise<string[]> {
		let cssFilePaths = await glob(`${folderPath.replace(/\\/g, '/')}/**/*.{${this.cssFileExtensions.join(',')}}`, {
			ignore: this.excludeGlobPatterns,
			nodir: true
		})
		
		cssFilePaths = cssFilePaths.map(path.normalize)
		return cssFilePaths
	}

	trackFile(filePath: string) {
		let item = this.map.get(filePath)
		if (!item) {
			this.map.set(filePath, {
				document: null,
				stylesheet: null
			})

			console.log(`File "${filePath}" tracked`)
			this.fresh = false
		}
	}

	//document was captured from vscode event
	reTrackFile(filePath: string, document?: TextDocument) {
		let item = this.map.get(filePath)
		if (item) {
			let isFresh = !!item.stylesheet
			if (isFresh) {
				if (document) {
					item.document = document
				}
				else {
					item.document = null
				}

				item.stylesheet = null
				console.log(`File "${filePath}" expired`)
			}
		}
		else {
			this.map.set(filePath, {
				document: null,
				stylesheet: null
			})

			console.log(`File "${filePath}" tracked`)
		}

		this.fresh = false
	}

	unTrackPath(deletedPath: string) {
		for (let filePath of this.map.keys()) {
			if (filePath.startsWith(deletedPath)) {
				this.map.delete(filePath)
				console.log(`File "${filePath}" untracked`)
			}
		}
	}

	async beFresh() {
		if (!this.fresh) {
			for (let [filePath, item] of this.map.entries()) {
				if (!item.stylesheet) {
					if (item.document) {
						await this.loadFromDocument(item.document)
					}
					else {
						await this.loadFromFilePath(filePath)
					}
				}
			}

			this.fresh = true
		}
	}

	private async loadFromFilePath(filePath: string) {
		let languageId = path.extname(filePath).slice(1).toLowerCase()
		let uri = Uri.file(filePath).toString()

		try {
			let text = await readText(filePath)
			let document = TextDocument.create(uri, languageId, 1, text)
			this.loadFromDocument(document)
		}
		catch (err) {
			console.log(err)
		}
	}

	private loadFromDocument(document: TextDocument) {
		let {uri} = document
		let filePath = Files.uriToFilePath(uri)!
		let languageService = CSSLanguageService.getFromLanguageId(document.languageId)
		let stylesheet = languageService.parseStylesheet(document)

		this.map.set(filePath, {
			document,
			stylesheet
		})

		console.log(`File "${filePath}" updated`)
	}

	async findDefinitionMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		let symbols = await this.findSymbolsMatchSelector(selector)
		let locations = symbols.map(symbol => symbol.location)
		return locations
	}

	async findSymbolsMatchSelector(selector: SimpleSelector): Promise<SymbolInformation[]> {
		await this.beFresh()

		let matchedSymbols: SymbolInformation[] = []

		for (let {document, stylesheet} of this.map.values()) {
			if (document && stylesheet) {
				let {uri, languageId} = document
				let symbols = CSSLanguageService.getFromLanguageId(languageId).findDocumentSymbols(document, stylesheet)
				let matcher = new SelectorMatcher(uri)

				matchedSymbols.push(...matcher.findSymbolsMatchSelector(symbols, selector))
			}
		}

		return matchedSymbols
	}
	
	async findSymbolsMatchQuery(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let matchedSymbols: SymbolInformation[] = []

		for (let {document, stylesheet} of this.map.values()) {
			if (document && stylesheet) {
				let {uri, languageId} = document
				let symbols = CSSLanguageService.getFromLanguageId(languageId).findDocumentSymbols(document, stylesheet)
				let matcher = new SelectorMatcher(uri)

				matchedSymbols.push(...matcher.findSymbolsMatchQuery(symbols, query))
			}
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

	/*
	the selector should be the start field of the last part, e.g., '.class' matches
		.class[...]
		.class:actived
		.class::before
		.class.class2
	these markers used to split parts: space > + ~ >>
	* will match any tag
	*/
	findSymbolsMatchSelector(symbols: SymbolInformation[], selector: SimpleSelector): SymbolInformation[] {
		let matchedSymbols: SymbolInformation[] = []
		let nestingMatcher: NestingMatcher | undefined

		if (this.supportsNesting) {
			nestingMatcher = new NestingMatcher(selector.raw)
		}

		for (let symbol of symbols) {
			let symbolSelector = symbol.name
			let matchedSymbol: SymbolInformation | undefined

			if (!MatchHelper.isSimpleSelector(symbolSelector)) {
				continue
			}

			if (selector.type === SimpleSelector.Type.Tag) {
				if (MatchHelper.isStartOfTheLastPart(selector.raw, symbolSelector)) {
					matchedSymbol = symbol
				}
			}
			else if (symbolSelector.includes(selector.raw) && MatchHelper.isStartOfTheLastPart(selector.raw, symbolSelector)) {
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
	or the three as the start field of any part of the symbol name
	*/
	public findSymbolsMatchQuery(symbols: SymbolInformation[], query: string): SymbolInformation[] {
		let matchedSymbols: SymbolInformation[] = []
		let nestingMatcher: NestingQueryMatcher | null = null

		query = query.toLowerCase()

		if (this.supportsNesting) {
			nestingMatcher = new NestingQueryMatcher(query)
		}

		for (let symbol of symbols) {
			let symbolSelector = symbol.name.toLowerCase()
			let matchedSymbol: SymbolInformation | null = null

			if (symbolSelector.includes(query) && MatchHelper.isQueryBeStartOfLastPart(query, symbolSelector)) {
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

	//'.a' matches '.b .a[...]', '.b > .a'
	//'.a' not matches '.a .b'
	export function isStartOfTheLastPart(selector: string, symbolSelector: string): boolean {
		let lastPartRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^ >+~])+$/
		let match = symbolSelector.match(lastPartRE)
		if (!match) {
			return false
		}

		let lastPart = match[0]
		return isStartOf(selector, lastPart)
	}

	//'.a' matches '.a[...]', '.a.b'
	//'.a' not matches '.a-b', '.b.a'
	export function isStartOf(selector: string, symbolSelector: string) {
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

	//'a' equals the union of '.a', '#a' and 'a' matches in isStartOfTheLastPart
	export function isQueryBeStartOfLastPart(query: string, symbolSelector: string): boolean {
		let lastPartRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^ >+~])+$/
		let match = symbolSelector.match(lastPartRE)
		if (!match) {
			return false
		}

		let lastPart = match[0]
		if (lastPart.startsWith(query)) {
			return true
		}
		
		if (isClassOrIdSelector(lastPart[0]) && !isClassOrIdSelector(query) && lastPart.slice(1).startsWith(query)) {
			return true
		}

		return false
	}

	export function isClassOrIdSelector(selector: string) {
		return selector[0] === '.' || selector[0] === '#'
	}

	//only test end position, null means range of whole document
	export function isRangeIn(range: Range, widerRange: Range | null): boolean {
		if (!widerRange) {
			return true
		}

		if (widerRange.end.line > range.end.line) {
			return true
		}
		
		if (widerRange.end.line === range.end.line && widerRange.end.character > range.end.character) {
			return true
		}

		return false
	}
}


interface NestingSelector {
	selector: string
	range: Range | null
}

class NestingMatcher {

	protected nestingSelectors: NestingSelector[]

	protected lastRejectedRange: Range | null

	constructor(rawSelector: string) {
		this.nestingSelectors = [{
			selector: rawSelector,
			range: null
		}]

		this.lastRejectedRange = null
	}

	addSymbolAndTestIfMatch(symbol: SymbolInformation): boolean {
		if (this.isInRejectedRange(symbol.location.range)) {
			return false
		}

		this.popOutOfRangeNestingSelectors(symbol.location.range)

		let symbolSelector = symbol.name
		let expectedSelector = this.nestingSelectors[this.nestingSelectors.length - 1].selector

		if (symbolSelector.includes(expectedSelector) && MatchHelper.isStartOf(expectedSelector, symbolSelector)) {
			return true
		}

		//when symbol '.a' meet query '.a-b', generate query '&-b'
		else if (expectedSelector.startsWith(symbolSelector)) {
			this.nestingSelectors.push({
				selector: '&' + expectedSelector.slice(symbolSelector.length),
				range: symbol.location.range
			})
		}

		//symbol '.c' not match '.a-b', all the following symbols in range will be skipped
		else {
			this.lastRejectedRange = symbol.location.range
		}

		return false
	}

	protected isInRejectedRange(range: Range) {
		if (this.lastRejectedRange) {
			if (MatchHelper.isRangeIn(range, this.lastRejectedRange)) {
				return true
			}
	
			this.lastRejectedRange = null
		}

		return false
	}
	
	protected popOutOfRangeNestingSelectors(range: Range) {
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


class NestingQueryMatcher extends NestingMatcher {

	//we run nesting match by removing '.' and '#', here we need to cache root selector to restore the full selector
	private rootSelector: string

	private isQueryingClassOrId: boolean

	constructor(query: string) {
		super(query)

		this.rootSelector = ''
		this.isQueryingClassOrId = MatchHelper.isClassOrIdSelector(query)
	}

	addSymbolAndTestIfMatch(symbol: SymbolInformation) {
		if (this.isInRejectedRange(symbol.location.range)) {
			return false
		}

		this.popOutOfRangeNestingSelectors(symbol.location.range)

		let symbolSelector = symbol.name.toLowerCase()
		if (MatchHelper.isClassOrIdSelector(symbolSelector[0]) && !this.isQueryingClassOrId) {
			symbolSelector = symbolSelector.slice(1)
		}

		let expectedSelector = this.nestingSelectors[this.nestingSelectors.length - 1].selector
		let matched = false

		//symbol 'a-b' match query 'a', and generate an expected '&'
		//symbol 'a' match query 'a', and also generate an expected '&'
		//symbol '&:hover' not match query '&'
		if (symbolSelector.startsWith(expectedSelector)) {
			if (this.nestingSelectors.length === 1) {
				this.rootSelector = symbol.name
			}

			matched = true
			if (expectedSelector === '&' && !/[\w-]/.test(symbolSelector.charAt(1))) {
				matched = false
			}

			if (matched) {
				if (this.nestingSelectors.length > 1) {
					symbol.name = this.mergeSymbolName(symbol.name)
				}

				this.nestingSelectors.push({
					selector: '&',	//truly expected '&[\w-]'
					range: symbol.location.range
				})

				return true
			}
		}
		//when symbol 'a' meet 'a-b', generate an query '&-b'
		else if (expectedSelector.startsWith(symbolSelector)) {
			if (this.nestingSelectors.length === 1) {
				this.rootSelector = symbol.name
			}

			this.nestingSelectors.push({
				selector: '&' + expectedSelector.slice(symbolSelector.length),
				range: symbol.location.range
			})
		}
		else {
			this.lastRejectedRange = symbol.location.range
		}

		return false
	}

	//name always starts with '&'
	mergeSymbolName(name: string): string {
		name = name.slice(1)

		//merge all except the last one, which has been tested
		for (let i = this.nestingSelectors.length - 2; i >= 0; i--) {
			let {selector} = this.nestingSelectors[i]

			if (i === 0) {
				name = this.rootSelector + name
			}
			else {
				name = selector.slice(1) + name
			}
		}

		return name
	}
}
