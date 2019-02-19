import * as path from 'path'
import Uri from 'vscode-uri'


import {
	RemoteConsole as console,
	TextDocument,
	SymbolInformation,
	Location,
	Files
} from 'vscode-languageserver'

import {
	getCSSLanguageService,
	getSCSSLanguageService,
	getLESSLanguageService,
	LanguageService,
	Stylesheet
} from 'vscode-css-languageservice'

import {
	SimpleSelector,
	SelectorType
} from './html-service'

import {
	readText,
	glob,
	getStat
} from './util'


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

export function getCSSLanguageServiceByLanguageId(languageId: string): LanguageService {
	if (initializedLanguageServices[languageId]) {
		return initializedLanguageServices[languageId]!
	}

	if (!languageServiceGenerator[languageId]) {
		console.log(`Language "${languageId}" is not a declared css language, using css service instead.`)
	}

	return initializedLanguageServices[languageId] = languageServiceGenerator[languageId]()
}


export type StylesheetItem = {
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

	has(path: string): boolean {
		return this.map.has(path)
	}

	get(path: string): StylesheetItem | undefined {
		return this.map.get(path)
	}

	set(path: string, item: StylesheetItem) {
		this.map.set(path, item)
	}

	delete(path: string): boolean {
		return this.map.delete(path)
	}

	keys(): IterableIterator<string> {
		return this.map.keys()
	}

	values(): IterableIterator<StylesheetItem> {
		return this.map.values()
	}

	async loadFromPath(filePath: string) {
		let stat = await getStat(filePath)
				
		if (stat.isDirectory()) {
			this.loadFromFolder(filePath)
		}
		else if (stat.isFile()) {
			let extname = path.extname(filePath).slice(1).toLowerCase()
			if (this.cssFileExtensions.includes(extname)) {
				this.loadFromCSSFilePath(filePath)
			}
		}
	}
	
	async loadFromFolder(folderPath: string) {
		let filePaths = await this.getCSSFilePathsInFolder(folderPath)

		for (let filePath of filePaths) {
			await this.loadFromCSSFilePath(filePath)
		}
	}
	
	private async getCSSFilePathsInFolder(folderPath: string): Promise<string[]> {
		let cssFilePaths = await glob(`${folderPath.replace(/\\/g, '/')}/**/*.{${this.cssFileExtensions.join(',')}}`, {
			ignore: this.excludeGlobPatterns,
			nodir: true
		})

		return cssFilePaths
	}

	private async loadFromCSSFilePath(cssFilePath: string) {
		let languageId = path.extname(cssFilePath).slice(1).toLowerCase()
		let uri = Uri.file(cssFilePath).toString()

		try {
			let text = await readText(cssFilePath)
			let document = TextDocument.create(uri, languageId, 1, text)
			this.loadFromDocument(document)
		}
		catch (err) {
			console.log(err)
		}
	}

	loadFromDocument(document: TextDocument) {
		let {uri} = document
		let filePath = Files.uriToFilePath(uri)!
		let languageService = getCSSLanguageServiceByLanguageId(document.languageId)
		let stylesheet = languageService.parseStylesheet(document)
		let hasItBefore = this.map.has(filePath)
		
		this.map.set(filePath, {
			document,
			stylesheet
		})

		if (hasItBefore) {
			console.log(`Stylesheet "${filePath}" updated`)
		}
		else {
			console.log(`Stylesheet "${filePath}" created`)
		}
	}

	deleteFromPath(deletedPath: string) {
		for (let filePath of this.map.keys()) {
			if (filePath.startsWith(deletedPath)) {
				this.map.delete(filePath)
				console.log(`Stylesheet "${filePath}" deleted`)
			}
		}
	}

	addOrSetStale(filePath: string, document?: TextDocument) {
		let item = this.map.get(filePath)
		if (item) {
			if (document) {
				item.document = document
			}
			else {
				item.document = null
			}

			item.stylesheet = null
			this.fresh = false
		}
		else {
			this.map.set(filePath, {
				document: null,
				stylesheet: null
			})
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
						await this.loadFromCSSFilePath(filePath)
					}
				}
			}

			this.fresh = true
		}
	}

	async findDefinitionMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		let symbols = await this.findSymbolsMatchSelector(selector)
		return symbols.map(symbol => symbol.location)
	}

	async findSymbolsMatchSelector(selector: SimpleSelector): Promise<SymbolInformation[]> {
		await this.beFresh()

		let foundSymbols: SymbolInformation[] = []

		for (let {document, stylesheet} of this.values()) {
			let {uri, languageId} = document!
			let symbols = getCSSLanguageServiceByLanguageId(languageId).findDocumentSymbols(document!, stylesheet!)
			let searcher = new ScssLessSelectorSearcher(uri, selector)

			foundSymbols.push(...searcher.searchSymbols(symbols))
		}

		return foundSymbols
	}
}


class ScssLessSelectorSearcher {

	private supportsNesting: boolean

	private nestingSelectors: {
		selector: string
		endLine: number
		endCharacter: number
	}[]

	private selector: SimpleSelector

	constructor(uri: string, selector: SimpleSelector) {
		this.selector = selector
		this.supportsNesting = this.isURISupportsNesting(uri)

		this.nestingSelectors = [{
			selector: selector.raw,
			endLine: Infinity,
			endCharacter: Infinity,
		}]
	}

	private isURISupportsNesting(uri: string) {
		return /\.(?:scss|less)$/.test(uri)
	}

	//the selector should be the start field of the last part, e.g., .class matches
	//	.class[...]
	//	.class:actived
	//	.class::before
	//	.class.class2
	//these markers used to split parts: space > + ~ >>
	//* will match any tag
	public searchSymbols(symbols: SymbolInformation[]): SymbolInformation[] {
		let matchedSymbols: SymbolInformation[] = []
		let selector = this.selector
		let rawSelector = selector.raw

		for (let symbol of symbols) {
			let symbolSelector = symbol.name
			let matchedSymbol: SymbolInformation | null = null

			if (selector.type === SelectorType.TAG) {
				if (this.isSelectorBeStartOfTheLastPartOf(rawSelector, symbolSelector)) {
					matchedSymbol = symbol
				}
				else if (symbolSelector === '*') {
					if (this.isSelectorBeStartOfTheLastPartOf('*', symbolSelector)) {
						matchedSymbol = symbol
					}
				}
			}
			else if (symbolSelector.includes(rawSelector) && this.isSelectorBeStartOfTheLastPartOf(rawSelector, symbolSelector)) {
				matchedSymbol = symbol
			}

			let nestingMatched = this.addSymbolAndTestIfMatch(symbol)
			if (!matchedSymbol && nestingMatched) {
				matchedSymbol = symbol
			}

			if (matchedSymbol) {
				matchedSymbols.push(matchedSymbol)
			}
		}

		return matchedSymbols
	}
	
	private isSelectorBeStartOfTheLastPartOf(selector: string, symbolSelector: string): boolean {
		let lastPartRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^ >+~])+$/
		let lastPartMatch = symbolSelector.match(lastPartRE)

		if (!lastPartMatch) {
			return false
		}

		let lastPartOfSymbolSelector = lastPartMatch[0]
		return this.isSelectorBeStartOf(selector, lastPartOfSymbolSelector)
	}

	private isSelectorBeStartOf(selector: string, symbolSelector: string) {
		if (!symbolSelector.startsWith(selector)) {
			return false
		}

		if (symbolSelector === selector) {
			return true
		}

		//.a not be the start of .a-b
		let isAnotherSelector = /[\w-]/.test(symbolSelector.charAt(selector.length))
		return !isAnotherSelector
	}

	private addSymbolAndTestIfMatch(symbol: SymbolInformation) {
		if (!this.supportsNesting) {
			return false
		}

		let symbolSelector = symbol.name
		let {line, character} = symbol.location.range.end

		//exclude all the out-of-range selectors
		if (this.nestingSelectors.length > 1) {
			while (this.nestingSelectors.length > 1) {
				let {endLine, endCharacter} = this.nestingSelectors[this.nestingSelectors.length - 1]
				let isSymbolInLastRange = endLine > line || endLine === line && endCharacter >= character

				if (isSymbolInLastRange) {
					break
				}
				else {
					this.nestingSelectors.pop()
				}
			}
		}

		let expectedSelector = this.nestingSelectors[this.nestingSelectors.length - 1].selector
		if (symbolSelector.includes(expectedSelector) && this.isSelectorBeStartOf(expectedSelector, symbolSelector)) {
			return true
		}
		else if (expectedSelector.startsWith(symbolSelector)) {
			this.nestingSelectors.push({
				selector: '&' + expectedSelector.slice(symbolSelector.length),
				endLine: line,
				endCharacter: character,
			})
		}

		return false
	}
}
