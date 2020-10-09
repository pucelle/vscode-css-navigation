import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {timer} from '../../libs'
import {CSSService} from './css-service'


export enum NameType{
	Selector,
	Keyframes,
	Import,
	AtRoot,
	OtherCommand,
	Others
}

interface LeafName {
	// Raw selector before processing nesting
	raw: string

	// Full selector after processing nesting
	full: string

	type: NameType
}

interface LeafRange {
	names: LeafName[]
	start: number
	end: number
	parent: LeafRange | undefined
}

interface FullAndMainName {
	full: string
	mains: string[] | null
}

export interface NamedRange {
	names: FullAndMainName[]
	range: Range
}

export class CSSRangeParser {

	private supportedLanguages = ['css', 'less', 'scss']
	private supportsNesting: boolean
	private document: TextDocument

	private stack: LeafRange[] = []
	private current: LeafRange | undefined
	private ignoreDeep: number = 0

	// When has `@import ...`, need to load the imported files even they are inside `node_modules`.
	private importPaths: string[] = []

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

	parse() {
		let text = this.document.getText()
		let ranges: LeafRange[] = []
		
		let re = /\s*(?:\/\/.*|\/\*[\s\S]*?\*\/|((?:\(.*?\)|".*?"|'.*?'|\/\/.*|\/\*[\s\S]*?\*\/|[\s\S])*?)([;{}]))/g
		/*
			\s* - match white spaces in left
			(?:
				\/\/.* - match comment line
				|
				\/\*[\s\S]*?\*\/ - match comment seagment
				|
				(?:
					\(.*?\) - (...), sass code may include @include fn(${name})
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
			let chars = match[1]
			let endChar = match[2]

			if (endChar === '{' && chars) {
				let startIndex = re.lastIndex - chars.length - 1
				let selector = chars.trimRight().replace(/\s+/g, ' ')
				let names = this.parseToNames(selector)

				if (names.length === 0) {
					continue
				}

				if (this.ignoreDeep > 0 || names[0].type === NameType.Keyframes) {
					this.ignoreDeep++
				}

				this.current = this.newLeafRange(names, startIndex)
				ranges.push(this.current!)
			}
			else if (endChar === '}') {
				if (this.ignoreDeep > 0) {
					this.ignoreDeep--
				}

				if (this.current) {
					this.current.end = re.lastIndex
					this.current = this.stack.pop()
				}
			}
			// `@...` command in top level
			// parse `@import ...` to `this.importPaths`
			else if (chars && !this.current) {
				this.parseToNames(chars)
			}
		}

		if (this.current) {
			if (this.current.end === 0) {
				this.current.end = text.length
			}
		}

		return {
			ranges: this.formatToNamedRanges(ranges),
			importPaths: this.importPaths
		}
	}

	//may selectors like this: '[attr="]"]', but we are not high strictly parser
	//if want to handle it, use /((?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\)|[\s\S])+?)(?:,|$)/g
	private parseToNames(selectors: string): LeafName[] {
		selectors = this.removeComments(selectors)
		
		let match = selectors.match(/^@[\w-]+/)
		let names: LeafName[] = []
		if (match) {
			let command = match[0]
			let type = this.getCommandType(command)

			if (type === NameType.Import) {
				this.parseImportPaths(selectors)
			}

			//@at-root still follows selectors
			if (type === NameType.AtRoot) {	//should only work on scss
				names.push({
					raw: command,
					full: command,
					type
				})
				selectors = selectors.slice(command.length).trimLeft()
			}

			//other command take place whole line
			else {
				names.push({
					raw: selectors,
					full: selectors,
					type
				})
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

		while (match = re.exec(selectors)) {
			let name = match[1].trim()
			if (name) {
				names.push({
					raw: name,
					full: name,
					type: this.ignoreDeep === 0 ? NameType.Selector : NameType.Others
				})
			}
		}

		return names
	}

	private removeComments(code: string) {
		return code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
	}

	private getCommandType(command: string): NameType {
		switch (command) {
			case '@at-root':
				return NameType.AtRoot

			case '@keyframes':
				return NameType.Keyframes
			
			case '@import':
				return NameType.Import
			
			default:
				return NameType.OtherCommand
		}
	}

	private parseImportPaths(selectors: string) {
		let match = selectors.match(/^@import\s+(['"])(.+?)\1/)
		if (match) {
			let isURL = /^https?:|^\/\//.test(match[2])
			if (!isURL) {
				this.importPaths.push(match[2])
			}
		}
	}

	private newLeafRange(names: LeafName[], start: number): LeafRange {
		if (this.supportsNesting && this.ignoreDeep === 0 && this.current && this.haveSelectorInNames(names)) {
			names = this.combineNestingNames(names)
		}

		let parent = this.current
		if (parent) {
			this.stack.push(parent)
		}

		return {
			names,
			start,
			end: 0,
			parent
		}
	}

	private haveSelectorInNames(names: LeafName[]): boolean {
		return names.length > 1 || names[0].type === NameType.Selector
	}

	private combineNestingNames(oldNames: LeafName[]): LeafName[] {
		let re = /(?<=^|[\s+>~])&/g	//has sass reference '&' if match
		let names: LeafName[] = []
		let parentFullNames = this.getClosestSelectorFullNames()
		let currentCommandType: NameType | undefined

		for (let oldName of oldNames) {
			//copy non selector one
			if (oldName.type !== NameType.Selector) {
				names.push(oldName)
				currentCommandType = oldName.type
			}
			//'a{&-b' -> 'a-b', not handle cross multiply when several '&' exist
			else if (parentFullNames && re.test(oldName.full)) {
				for (let parentFullName of parentFullNames) {
					let full = oldName.full.replace(re, parentFullName)
					names.push({full, raw: oldName.raw, type: NameType.Selector})
				}
			}
			//'a{b}' -> 'a b', but not handle '@at-root a{b}'
			else if (currentCommandType !== NameType.AtRoot && parentFullNames) {
				for (let parentFullName of parentFullNames) {
					let full = parentFullName + ' ' + oldName.full
					names.push({full, raw: oldName.raw, type: NameType.Selector})
				}
			}
			else {
				names.push(oldName)
			}
		}

		return names
	}

	private getClosestSelectorFullNames(): string[] | null {
		let parent = this.current
		while (parent) {
			if (this.haveSelectorInNames(parent.names)) {
				break
			}
			parent = parent.parent
		}
		if (!parent) {
			return null
		}
		
		let fullNames: string[] = []
		for (let name of parent.names) {
			if (name.type === NameType.Selector) {
				fullNames.push(name.full)
			}
		}
		return fullNames
	}

	private formatToNamedRanges(leafRanges: LeafRange[]): NamedRange[] {
		let ranges: NamedRange[] = []

		for (let {names, start, end} of leafRanges) {
			ranges.push({
				names: names.map(leafName => this.formatLeafNameToFullMainName(leafName)),
				//positionAt use a binary search algorithm, it should be fast enough, no need to count lines here, although faster
				range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
			})
		}

		return ranges
	}

	private formatLeafNameToFullMainName({raw, full, type}: LeafName): FullAndMainName {
		if (type !== NameType.Selector) {
			return {
				full,
				mains: null
			}
		}

		//if raw selector is like '&:...', ignore processing the main
		let shouldHaveMain = !this.hasSingleReferenceInRightMostDescendant(raw)
		if (!shouldHaveMain) {
			return {
				full,
				mains: null
			}
		}

		let mains = this.getMainSelectors(full)
		return {
			full,
			mains
		}
	}

	//like '&:hover', 'a &:hover'
	private hasSingleReferenceInRightMostDescendant(selector: string): boolean {
		let rightMost = this.getRightMostDescendant(selector)
		return /^&(?:[^\w-]|$)/.test(rightMost)
	}

	/*
	it returns the start of the right most descendant
	e.g., selectors below wull returns '.a'
		.a[...]
		.a:actived
		.a::before
		.a.b
	*/
	private getMainSelectors(selector: string): string[] | null {
		let rightMost = this.getRightMostDescendant(selector)
		if (!rightMost) {
			return null
		}
		
		let match = rightMost.match(/^\w[\w-]*/)
		if (match) {
			//if main is a tag selector, it must be the only
			if (match[0].length === selector.length) {
				return match
			}
			rightMost = rightMost.slice(match[0].length)
		}
		
		//class and id selectors must followed each other
		let mains: string[] = []
		while (match = rightMost.match(/^[#.]\w[\w-]*/)) {
			mains.push(match[0])
			rightMost = rightMost.slice(match[0].length)
		}

		return mains.length > 0 ? mains : null
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
