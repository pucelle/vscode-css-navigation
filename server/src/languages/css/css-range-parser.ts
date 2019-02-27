import {TextDocument, Range} from 'vscode-languageserver'
import {timer} from '../../libs'
import {CSSService} from './css-service'


interface Name {
	full: string
	main: string
}

interface NamedOffset {
	names: Name[]
	start: number
	end: number
}

export interface NamedRange {
	names: Name[]
	range: Range
}

export class CSSRangeParser {

	private supportedLanguages = ['css', 'less', 'scss']
	private supportsNesting: boolean
	private document: TextDocument

	constructor(document: TextDocument) {
		//here mixed language and file extension, must makesure all languages supported are sames as file extensions
		//may needs to be modified if more languages added
		let {languageId} = document
		if (!this.supportedLanguages.includes(languageId)) {
			languageId = 'css'
			timer.log(`Language "${languageId}" is not a declared css language, using css language instead.`)
		}

		this.supportsNesting = CSSService.isLanguageSupportsNesting(languageId)
		this.document = document
	}

	parse(): NamedRange[] {
		let text = this.document.getText()
		let stack: NamedOffset[] = []
		let offsets: NamedOffset[] = []
		let current: NamedOffset | undefined

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
				let rawNames: string[] = this.parseSelectorToNames(content)
				let names: Name[]
				let start = re.lastIndex - content.length - 1

				if (this.supportsNesting && current) {
					names = this.fixNestingSelectors(rawNames, current.names)
					stack.push(current)
				}
				else {
					names = rawNames.map(name => {
						return {
							full: name,
							main: this.getMainSelector(name)
						}
					})
				}

				current = {
					names,
					start,
					end: 0
				}

				offsets.push(current)
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

		let ranges: NamedRange[] = offsets.map(({names, start, end}) => {
			return {
				names,
				//positionAt use a binary search algorithm, it should be fast enough, no need to count lines here, although faster
				range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
			}
		})

		return ranges
	}

	/*
	it returns the start of the right most descendant
	e.g., selectors below wull returns '.a'
		.a[...]
		.a:actived
		.a::before
		.a.b

	otherwise, if main is a tag name, it must be at start, e.g., 'body > div' or 'body div' should not matc
	*/
	private getMainSelector(selector: string): string {
		if (!this.isSelector(selector)) {
			return ''
		}

		let rightMost = this.getRightMostDescendant(selector)
		if (!rightMost) {
			return ''
		}

		let match = rightMost.match(/^[#.]?\w[\w-]*/)
		if (!match) {
			return ''
		}

		let main = match[0]
		if (/[\w]/.test(main[0]) && rightMost.length < selector.length) {
			return ''
		}

		return main
	}

	//avoid parsing @keyframes anim-name as tag name
	private isSelector(selector: string): boolean {
		return selector[0] !== '@'
	}

	//the descendant combinator used to split ancestor and descendant: space > + ~ >> ||
	private getRightMostDescendant(selector: string): string {
		let descendantRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^\s>+~|])+?$/
		/*
			(?:
				\[[^\]]+?\] - [...]
				|
				\([^)]+?\) - (...)
				|
				[^\s>+~] - others which are not descendant combinator
			)+? - must have ?, or the greedy mode will cause unnecessary exponential fallback
			$
		*/

		let match = selector.match(descendantRE)
		return match ? match[0] : ''
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

	private fixNestingSelectors(rawNames: string[], parentNames: Name[]): Name[] {
		let names: Name[] = []

		for (let rawName of rawNames) {
			if (rawName.includes('&')) {
				//only handle the first '&', not handle cross multiply when several '&' exist
				let hasMain = !this.hasSingleReferenceInRightMostDescendant(rawName)
				for (let {full: parentName} of parentNames) {
					let full = rawName.replace(/&/g, parentName)
					let main = hasMain ? this.getMainSelector(full) : ''
					names.push({full, main})
				}
			}
			else {
				names.push({
					full: rawName,
					main: this.getMainSelector(rawName)
				})
			}
		}

		return names
	}

	//like '&:hover', 'a &:hover'
	private hasSingleReferenceInRightMostDescendant(selector: string): boolean {
		let rightMost = this.getRightMostDescendant(selector)
		return /^&(?:[^\w-]|$)/.test(rightMost)
	}
}
