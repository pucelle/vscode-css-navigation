import {TextDocument, Range, SymbolInformation, SymbolKind, Location} from 'vscode-languageserver'
import {SimpleSelector} from './html-service'


interface NamedRange {
	names: string[]
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

		for (let range of this.ranges) {
			let isMatch = range.names.some((name) => {
				if (!Helper.isSelector(name)) {
					return false
				}
				return Helper.isSelectorBeStartOfTheRightMostDescendant(selector.raw, name)
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
			for (let name of range.names) {
				let isMatch = Helper.isMatchQuery(name, lowerQuery)
				if (isMatch) {
					symbols.push(SymbolInformation.create(
						name,
						SymbolKind.Class,
						range.range,
						this.uri
					))
				}
			}
		}

		return symbols
	}
}


class CSSSymbolParser {

	private supportedLanguages = ['css', 'less', 'scss']
	private supportedNestingLanguages = ['less', 'scss']

	private languageId: string
	private supportsNesting: boolean
	private document: TextDocument

	constructor(document: TextDocument) {
		let {languageId} = document
		if (!this.supportedLanguages.includes(languageId)) {
			languageId = 'css'
			console.log(`Language "${languageId}" is not a declared css language, using css language instead.`)
		}
		this.languageId = languageId
		this.supportsNesting = this.supportedNestingLanguages.includes(languageId)
		this.document = document
	}

	parse(): CSSSymbol {
		interface MiddleRange {
			names: string[]
			start: number
			end: number
		}

		let text = this.document.getText()
		let stack: MiddleRange[] = []
		let list: MiddleRange[] = []
		let current: MiddleRange | undefined

		let re = /\s*(?:\/\/.+|\/\*[\s\S]*?\*\/|((?:".*?"|'.*?'|[\s\S])*?)([;{}]))/g
		/*
			\s* - match white spaces in left
			(?:
				\/\/.+ - match comment line
				|
				\/\*[\s\S]*?\*\/ - match comment seagment
				|
				(?:
					".*?" - double quote string
					|
					'.*?' - double quote string
					|
					[\s\S] - others
				)*? - declaration or selector
				([;{}])
			)
		*/

		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let content = match[1]
			let endChar = match[2]

			if (endChar === '{') {
				let names = this.parseSelectorToNames(content)
				let start = re.lastIndex - content.length - 1

				if (this.supportsNesting && current) {
					names = this.fixNestingSelectors(names, current.names)
					stack.push(current)
				}

				current = {
					names,
					start,
					end: 0
				}

				list.push(current)
			}
			else if (endChar === '}') {
				if (current) {
					current.end = re.lastIndex
					current = stack.pop()
				}
			}
		}

		if (current) {
			if (current.end === 0) {
				current.end = text.length
			}
		}

		let symbols: NamedRange[] = list.map(({names, start, end}) => {
			return {
				names,

				//positionAt use a binary search algorithm, it should be fast enough, no need to count lines here, although faster
				range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
			}
		})

		return new CSSSymbol(this.document, symbols)
	}

	//may selectors like this: '[attr="]"]', but its not being required as high strict parser, so just ok
	//if want to handle it, replace '[\s\S]' to (?:".*?"|'.*?'|[\s\S])
	private parseSelectorToNames(multiSelector: string): string[] {
		let re = /((?:\[[\s\S]*?\]|\([\s\S]*?\)|[\s\S])+?)(?:,|$)/g
		/*
			(?:
				\[[\s\S]*?\] - match [...]
				|
				\([\s\S]*?\) - match (...)
				|
				[\s\S] - match other characters
			)
			+?
			(?:,|$) - if match ',' or '$', end
		*/

		let match: RegExpExecArray | null
		let selectors: string[] = []

		while (match = re.exec(multiSelector)) {
			let selector = match[1].trim()
			if (selector) {
				selectors.push(selector)
			}
		}

		return selectors
	}

	private fixNestingSelectors(names: string[], parentNames: string[]): string[] {
		let fixed: string[] = []

		for (let name of names) {
			if (name.includes('&')) {
				for (let parentName of parentNames) {
					//only replace one '&', not handle cross multiple of several '&'
					fixed.push(name.replace(/(?<=^|[[^\s>+~]])&/, parentName))
				}
			}
			else {
				fixed.push(name)
			}
		}

		return fixed
	}
}


namespace Helper {

	//avoid parsing @keyframes anim-name as tag name
	export function isSelector(selector: string): boolean {
		return selector[0] !== '@'
	}

	//the descendant combinator used to split ancestor and descendant: space > + ~ >> ||
	export function isSelectorBeStartOfTheRightMostDescendant(selector: string, symbolSelector: string): boolean {
		let descendantRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^\s>+~])+$/
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