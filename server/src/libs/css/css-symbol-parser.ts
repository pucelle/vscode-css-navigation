import {TextDocument, Range} from 'vscode-languageserver'
import {NamedRange, CSSSymbol} from './css-symbol'
import {getMainSelector} from './helper'


export class CSSSymbolParser {

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
				names: names.map(full => ({
					full,
					main: getMainSelector(full)
				})),

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
