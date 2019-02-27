import {TextDocument, Range} from 'vscode-languageserver'
import {timer} from '../../libs'
import {CSSService} from './css-service'


interface Name {
	full: string
	main: string
}

interface TreeRange {
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
	private languageId: string

	constructor(document: TextDocument) {
		//here mixed language and file extension, must makesure all languages supported are sames as file extensions
		//may needs to be modified if more languages added
		let {languageId} = document
		if (!this.supportedLanguages.includes(languageId)) {
			languageId = 'css'
			timer.log(`Language "${languageId}" is not a declared css language, using css language instead.`)
		}

		this.languageId = languageId
		this.supportsNesting = CSSService.isLanguageSupportsNesting(languageId)
		this.document = document
	}

	parse(): NamedRange[] {
		let text = this.document.getText()
		let ranges: TreeRange[] = []
		let current: TreeRange | undefined
		let stack: TreeRange[] = []

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
				let rawNames = this.parseToNames(content)
				let names: Name[]
				let start = re.lastIndex - content.length - 1
				
				if (this.supportsNesting && current) {
					stack.push(current)
					names = this.combineNestingSelectors(rawNames, current.names)
				}
				else {
					names = rawNames.map(name => {
						return {
							full: name,
							main: this.shouldBeSelector(name) ? this.getMainSelector(name) : ''
						}
					})
				}

				current = {
					names,
					start,
					end: 0
				}
				ranges.push(current)
			}
			else if (endChar === '}') {
				if (current) {
					current.end = re.lastIndex

					if (this.supportsNesting) {
						current = stack.pop()
					}
				}
			}
		}

		if (current) {
			if (current.end === 0) {
				current.end = text.length
			}
		}

		let namedRanges = ranges.map(({names, start, end}) => {
			return {
				names,
				//positionAt use a binary search algorithm, it should be fast enough, no need to count lines here, although faster
				range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
			}
		})

		return namedRanges
	}

	//may selectors like this: '[attr="]"]', but we are not high strictly parser
	//if want to handle it, use /((?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\)|[\s\S])+?)(?:,|$)/g
	private parseToNames(multiSelectors: string): string[] {
		let match = multiSelectors.match(/^@[\w-]+/)
		let names: string[] = []
		if (match) {
			let command = match[0]
			if (this.languageId === 'scss' && command === '@at-root') {
				names.push(command)
				multiSelectors = multiSelectors.slice(command.length).trimLeft()
			}
			else {
				command = multiSelectors
				names.push(command)
				return names
			}
		}

		let re = /((?:\[.*?\]|\(.*?\)|.)+?)(?:,|$)/gs
		/*
			(?:
				\[.*?\] - match [...]
				|
				\(.*?\) - match (...)
				|
				. - match other characters
			)
			+?
			(?:,|$) - if match ',' or '$', end
		*/

		while (match = re.exec(multiSelectors)) {
			let name = match[1].trim()
			if (name) {
				names.push(name)
			}
		}

		return names
	}

	private combineNestingSelectors(rawNames: string[], parentNames: Name[]): Name[] {
		let re = /(?<=^|[\s+>~])&/g
		let names: Name[] = []

		for (let rawName of rawNames) {
			if (!this.shouldBeSelector(rawName)) {
				names.push({
					full: rawName,
					main: ''
				})
				continue
			}

			let willCombine = re.test(rawName)
			if (willCombine) {
				//only handle the first '&', not handle cross multiply when several '&' exist
				//if is selectors like '&:...', ignore main
				let shouldHaveMain = !this.hasSingleReferenceInRightMostDescendant(rawName)

				//get full name, but ignore @command
				let parentFullNames = parentNames.map(({full}) => full).filter(this.shouldBeSelector)
				for (let parentFullName of parentFullNames) {
					let full = rawName.replace(re, parentFullName)
					let main = shouldHaveMain ? this.getMainSelector(full) : ''
					names.push({full, main})
				}
			}
			else {
				let full = rawName
				let main = this.getMainSelector(full)
				names.push({full, main})
			}
		}

		return names
	}

	//like '&:hover', 'a &:hover'
	private hasSingleReferenceInRightMostDescendant(selector: string): boolean {
		let rightMost = this.getRightMostDescendant(selector)
		return !/^&[\w-]/.test(rightMost)
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
	private shouldBeSelector(selector: string): boolean {
		return Boolean(selector && selector[0] !== '@')
	}

	//the descendant combinator used to split ancestor and descendant: space > + ~
	//it's not a strict regexp, if want so, use /(?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[^\]])*?+?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[^)])*?+?\)|[^\s>+~|])+?$/
	private getRightMostDescendant(selector: string): string {
		let descendantRE = /(?:\[[^\]]*?\]|\([^)]*?\)|[^\s+>~])+?$/
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
}
