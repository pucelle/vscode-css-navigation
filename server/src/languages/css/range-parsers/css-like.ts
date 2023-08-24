import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {console} from '../../../helpers'
import {CSSService} from '../css-service'


export enum LeafNameType{
	Selector,
	Keyframes,
	Import,
	AtRoot,
	OtherCommand,
	Others
}

/** `.a, .b` will be split as 2 leaves. */
export interface LeafName {

	/** CSS leaf piece type. */
	type: LeafNameType

	/** Raw selector before processing nesting, may have a `&` in left. */
	raw: string

	/** Full selector after processing nesting, `&` was fixed and removed. */
	full: string
}

/** 
 * Internal leaf node.
 * Cascade in the same rule of nesting.
 */
export interface Leaf {
	names: LeafName[]
	rangeStart: number
	rangeEnd: number
	parent: Leaf | undefined
}

/** One selector name. */
export interface CSSDeclarationName {

	/** Full selector, may includes `:` or `[...].`, nesting. */
	full: string

	/** 
	 * Main names, exclude `:` or `[...].`, only last part exist.
	 * e.g., selectors below will returns `.a`:
	 * 	.a[...]
	 * 	.a:active
	 * 	.a::before
	 * 	.a.b
	 */
	mains: string[] | null
}

/** 
 * One declaration range and it's mapped names.
 * Contains few messages and keep for long time.
 */
export interface CSSDeclarationRange {
	names: CSSDeclarationName[]
	range: Range
}

/** The full parse result, includes each declaration range, and import paths. */
export interface CSSRangeResult {
	importPaths: string[]
	ranges: CSSDeclarationRange[]
}


/** 
 * To parse one css, or a css-like file to declarations.
 * It lists all the declarations, and mapped selector names.
 */
export class CSSLikeRangeParser {

	protected supportedLanguages = ['css', 'less', 'scss']
	protected supportsNesting: boolean = false
	protected document: TextDocument
	protected leaves: Leaf[] = []
	protected stack: Leaf[] = []
	protected current: Leaf | undefined
	protected ignoreDeep: number = 0

	/** 
	 * When having `@import ...`, we need to load the imported files even they are inside `node_modules`.
	 * So we list the import paths here and load them later.
	 */
	protected importPaths: string[] = []

	constructor(document: TextDocument) {
		this.document = document
		this.initializeNestingSupporting()
		this.parseAsLeaves()
	}

	protected initializeNestingSupporting() {
		let {languageId} = this.document

		if (!this.supportedLanguages.includes(languageId)) {
			languageId = 'css'
			console.warn(`Language "${languageId}" is not a declared css language name, using css language instead.`)
		}

		this.supportsNesting = CSSService.isLanguageSupportsNesting(languageId)
	}

	private parseAsLeaves() {
		let text = this.document.getText()
		let re = /\s*(?:\/\/.*|\/\*[\s\S]*?\*\/|((?:\(.*?\)|".*?"|'.*?'|\/\/.*|\/\*[\s\S]*?\*\/|[\s\S])*?)([;{}]))/g
		/*
			\s*						--- match white spaces in left
			(?:
				\/\/.*				--- match comment line
				|
				\/\*[\s\S]*?\*\/	--- match comment segment
				|
				(?:
					\(.*?\)			--- (...), sass code may include @include fn(${name})
					".*?"			--- double quote string
					|
					'.*?'			--- double quote string
					|
					[\s\S]			--- others
				)*?					--- declaration or selector
				([;{}])
			)
		*/

		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let chars = match[1] || ''
			let endChar = match[2] || ''

			// Note here it's not `match.index`.
			let rangeStartIndex = re.lastIndex - chars.length - 1

			if (endChar === '{' && chars) {
				let names = this.parseSelectorNames(chars)
				if (names.length === 0) {
					continue
				}

				if (this.ignoreDeep > 0 || names[0].type === LeafNameType.Keyframes) {
					this.ignoreDeep++
				}

				this.current = this.newLeaf(names, rangeStartIndex)
				this.leaves.push(this.current!)
			}
			
			else if (endChar === '}') {
				if (this.ignoreDeep > 0) {
					this.ignoreDeep--
				}

				if (this.current) {
					this.current.rangeEnd = re.lastIndex
					this.current = this.stack.pop()
				}
			}

			// Likes `@...` command in top level.
			// Will only parse `@import ...` and push them to `importPaths` property.
			else if (chars && !this.current) {
				this.parseSelectorNames(chars)
			}
		}

		// .a{$
		if (this.current) {
			if (this.current.rangeEnd === 0) {
				this.current.rangeEnd = text.length
			}
		}
	}

	parse(): CSSRangeResult {
		return {
			ranges: this.formatLeavesToRanges(this.leaves),
			importPaths: this.importPaths
		}
	}

	/** Parse selector to name array. */
	protected parseSelectorNames(selectorString: string): LeafName[] {

		// May selectors like this: '[attr="]"]', but this is not a very strict parser.
		// If want to handle it, use `/((?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\)|[\s\S])+?)(?:,|$)/g`
		let re = /(@[\w-]+)|\/\/.*|\/\*[\s\S]*?\*\/|((?:\[.*?\]|\(.*?\)|.)+?)(?:,|$)/g
		/*
			^\s*@[\w-]+ 		--- Matches like `@at-root`
			|
			\/\/.*      		--- Matches single line comment
			|
			\/\*[\s\S]*?\*\/	--- Matches multiple lines comment
			(?:
				\[.*?\] 		--- Matches [...]
				|
				\(.*?\) 		--- Matches (...)
				|
				. 				--- Matches other characters
			)
			+?
			(?:,|$)				--- if Matches ',' or '$', end
		*/

		let match: RegExpExecArray | null
		let names: LeafName[] = []
		
		while (match = re.exec(selectorString)) {
			let command = match[1]
			let selector = match[2]?.trim()

			// Parse a command.
			if (command) {
				let type = this.getCommandType(command)

				if (type === LeafNameType.Import) {
					this.parseImportPaths(selectorString)
				}

				// `@at-root` may still have selectors followed.
				if (type === LeafNameType.AtRoot) {
					names.push({
						type,
						raw: command,
						full: command,
					})
				}

				// Otherwise commands eat off whole line.
				else {
					names.push({
						type,
						raw: selectorString,
						full: selectorString,
					})

					break
				}
			}

			// Parse selectors.
			else if (selector) {
				names.push({
					type: this.ignoreDeep === 0 ? LeafNameType.Selector : LeafNameType.Others,
					raw: selector,
					full: selector,
				})
			}
		}

		return names
	}

	/** Get command type. */
	private getCommandType(command: string): LeafNameType {
		switch (command) {
			case '@at-root':
				return LeafNameType.AtRoot

			case '@keyframes':
				return LeafNameType.Keyframes
			
			case '@import':
				return LeafNameType.Import
			
			default:
				return LeafNameType.OtherCommand
		}
	}

	/** Parse `@import ...` to `importPaths` properties. */
	private parseImportPaths(selectors: string) {
		let match = selectors.match(/^@import\s+(['"])(.+?)\1/)
		if (match) {
			let isURL = /^https?:|^\/\//.test(match[2])
			if (!isURL) {
				this.importPaths.push(match[2])
			}
		}
	}

	/** Create a leaf node. */
	protected newLeaf(names: LeafName[], rangeStart: number): Leaf {
		if (this.supportsNesting && this.ignoreDeep === 0 && this.current && this.haveSelectorInNames(names)) {
			names = this.combineNestingNames(names)
		}

		let parent = this.current
		if (parent) {
			this.stack.push(parent)
		}

		return {
			names,
			rangeStart,
			rangeEnd: 0,
			parent,
		}
	}

	/** Check whether having selector in names. */
	private haveSelectorInNames(names: LeafName[]): boolean {
		return names.length > 1 || names[0].type === LeafNameType.Selector
	}

	/** Combine nesting names into a name stack group. */
	private combineNestingNames(oldNames: LeafName[]): LeafName[] {
		let re = /(?<=^|[\s+>~])&/g
		let names: LeafName[] = []
		let parentFullNames = this.getClosestSelectorFullNames()
		let currentCommandType: LeafNameType | undefined

		for (let oldName of oldNames) {

			// When not a selector.
			if (oldName.type !== LeafNameType.Selector) {
				names.push(oldName)
				currentCommandType = oldName.type
			}

			// `a{&-b` -> `a-b`, not handle joining multiply & when several `&` exist.
			else if (parentFullNames && re.test(oldName.full)) {
				for (let parentFullName of parentFullNames) {
					let full = oldName.full.replace(re, parentFullName)
					names.push({
						type: LeafNameType.Selector,
						full,
						raw: oldName.raw,
					})
				}
			}

			// `a{b}` -> `a b`, but doesn't handle `@at-root a{b}`.
			else if (currentCommandType !== LeafNameType.AtRoot && parentFullNames) {
				for (let parentFullName of parentFullNames) {
					let full = parentFullName + ' ' + oldName.full
					names.push({
						type: LeafNameType.Selector,
						full,
						raw: oldName.raw,
					})
				}
			}
			else {
				names.push(oldName)
			}
		}

		return names
	}

	/** Get names of closest parent selector. */
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
			if (name.type === LeafNameType.Selector) {
				fullNames.push(name.full)
			}
		}

		return fullNames
	}

	/** Leaves -> ranges. */
	protected formatLeavesToRanges(leaves: Leaf[]): CSSDeclarationRange[] {
		return leaves.map(leaf => this.formatOneLeafToRange(leaf))
	}

	/** Leaf -> ranges. */
	protected formatOneLeafToRange(leaf: Leaf): CSSDeclarationRange {
		return {
			names: leaf.names.map(leafName => this.formatLeafNameToDeclarationName(leafName)),

			// `positionAt` uses a binary search algorithm, it should be fast enough,
			// we should have no need to count lines here to mark line and column number here,
			// although it should be faster.
			range: Range.create(this.document.positionAt(leaf.rangeStart), this.document.positionAt(leaf.rangeEnd))
		} as CSSDeclarationRange
	}

	/** Leaf name -> names. */
	private formatLeafNameToDeclarationName({raw, full, type}: LeafName): CSSDeclarationName {
		if (type !== LeafNameType.Selector) {
			return {
				full,
				mains: null
			}
		}

		// If raw selector is like `&:...`, it's the same as parent selector, ignore processing the main.
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
			mains,
		}
	}

	/** Checks whether having a reference tag `&` in right most part, returns `true` for '&:hover', 'a &:hover'. */
	private hasSingleReferenceInRightMostDescendant(selector: string): boolean {
		let rightMost = this.getRightMostDescendant(selector)
		return /^&:(?:[^\w-]|$)/.test(rightMost)
	}

	/**
	 * Returns the start of the right most descendant as the main part.
	 * e.g., selectors below will returns `.a`:
	 *  p.a
	 * 	.a[...]
	 * 	.a:active
	 * 	.a::before
	 * 	.a.b
	 */
	private getMainSelectors(selector: string): string[] | null {
		let rightMost = this.getRightMostDescendant(selector)
		if (!rightMost) {
			return null
		}
		
		let match = rightMost.match(/^\w[\w-]*/)
		if (match) {

			// if is a tag selector, it must be the only
			if (match[0].length === selector.length) {
				return match
			}

			rightMost = rightMost.slice(match[0].length)
		}
		
		// class and id selectors must followed each other
		let mains: string[] = []
		while (match = rightMost.match(/^[#.]\w[\w-]*/)) {
			mains.push(match[0])
			rightMost = rightMost.slice(match[0].length)
		}

		return mains.length > 0 ? mains : null
	}

	/** Returns descendant combinator used to split ancestor and descendant: space > + ~. */
	private getRightMostDescendant(selector: string): string {

		// It's not a strict regexp, if want so, use /(?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[^\]])*?+?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[^)])*?+?\)|[^\s>+~|])+?$/
		let descendantRE = /(?:\[[^\]]*?\]|\([^)]*?\)|[^\s+>~])+?$/
		/*
			(?:
				\[[^\]]+?\]	--- [...]
				|
				\([^)]+?\)	--- (...)
				|
				[^\s>+~]	--- others which are not descendant combinator
			)+? - must have ?, or the greedy mode will cause unnecessary exponential fallback
			$
		*/

		let match = selector.match(descendantRE)
		return match ? match[0] : ''
	}
}
