import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService} from '../css-service'


export enum LeafNameType{
	Selector,
	Command,
	Interpolation,	// Sass interpolation #{...}
	CSSVariableName,	// CSS variable name `--variable-name`
	Others,
}

/** `.a, .b` will be splitted to 2 leaves. */
export interface LeafName {

	/** CSS leaf piece type. */
	type: LeafNameType

	/** Raw selector before processing nesting, may have a `&` on left. */
	raw: string

	/** 
	 * Full selector after processing nesting, `&` will be joined with parent selected.
	 * Will be initialized to current selector, later join with parent selectors.
	 */
	full: string
}

/** 
 * Internal leaf node.
 * names are the list of nesting selector names, like `.a .b` -> [.a, .b].
 */
export interface Leaf {

	/** `names` may be empty list. */
	names: LeafName[]

	rangeStart: number
	rangeEnd: number
	parent: Leaf | undefined
	skipDeeply: boolean
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
		let re = /\s*(?:\/\/.*|\/\*[\s\S]*?\*\/|((?:\(.*?\)|".*?"|'.*?'|\/\/.*|\/\*[\s\S]*?\*\/|#\{[\s\S]*?\}|--[\w-]+\s*:|[\s\S])*?)([;{}]))/g
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
					--[\w-]+\s*:    --- CSS Variables
					|
					#\{[\s\S]*?\}	--- Sass Variables
					|
					[\s\S]			--- others
				)*?					--- declaration or selector
				([;{}])             --- part end char, or match brackets
			)
		*/

		// TODO:
		// This regular expression is too complex,
		// it should be replaced to a token parser.

		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let chars = match[1] || ''
			let endChar = match[2] || ''

			// Note here it's not `match.index`.
			let rangeStartIndex = re.lastIndex - chars.length - 1

			if (endChar === '{' && chars) {
				let names = this.parseSelectorNamesLike(chars)
				this.current = this.makeLeaf(names, rangeStartIndex)
				this.leaves.push(this.current!)
			}
			
			else if (endChar === '}') {
				if (this.current) {
					this.current.rangeEnd = re.lastIndex
					this.current = this.stack.pop()
				}
			}

			// Likes `@...` command in top level.
			// Here it only parses `@import ...` and push them to `importPaths` property.
			else if (chars && !this.current) {
				this.parseSelectorNamesLike(chars)
			}

			// Like `--variable-name`, not enter stack.
			else {
				let namesStarts = this.parseCSSVariableNames(chars)
				for (let {name, start} of namesStarts) {
					this.leaves.push(this.makeLeaf([name], rangeStartIndex + start))
				}
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

	/** 
	 * Parse selector to name array.
	 * `@command-name` will also be parsed.
	 */
	protected parseSelectorNamesLike(selectorString: string): LeafName[] {

		// May selectors like this: '[attr="]"]', so this is not a strict parser expression.
		// If want to handle it, use `/((?:\[(?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\]|\((?:"(?:\\"|.)*?"|'(?:\\'|.)*?'|[\s\S])*?\)|[\s\S])+?)(?:,|$)/g`
		let re = /(@[\w-]+)|\/\/.*|\/\*[\s\S]*?\*\/|((?:\[.*?\]|\(.*?\)|.|#\{.*?\})+?)(?:,|$)/g
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
				#\{.*?\}		--- Matches Sass interpolation #{...}
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
				let commandName = command.slice(1)

				if (commandName === 'import') {
					this.parseImportPaths(selectorString)
				}

				names.push({
					type: LeafNameType.Command,
					raw: selectorString,
					full: selectorString,
				})

				// `@at-root` may still have selectors followed.
				if (commandName !== 'at-root') {
					break
				}
			}
			
			// Parse selectors.
			else if (this.current?.skipDeeply) {
				names.push({
					type: LeafNameType.Others,
					raw: selector,
					full: selector,
				})
			}

			// Parse selectors.
			else if (selector) {

				// Sass variable, ignore it.
				if (/\#\{[\s\S]*?\}/.test(selector)) {
					names.push({
						type: LeafNameType.Interpolation,
						raw: selector,
						full: selector,
					})
				}
				else {
					names.push({
						type: LeafNameType.Selector,
						raw: selector,
						full: selector,
					})
				}
			}
		}

		return names
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

	/** Make a leaf node. */
	protected makeLeaf(names: LeafName[], rangeStart: number): Leaf {
		if (this.supportsNesting && this.current && this.haveSelectorInNames(names)) {
			names = this.combineNestingNames(names)
		}

		let parent = this.current

		// Skips whole keyframes declaration.
		let skipDeeply = names.length > 0
			&& names[0].type === LeafNameType.Command
			&& names[0].raw.startsWith('@keyframes')

		if (parent) {
			this.stack.push(parent)
			skipDeeply = skipDeeply || parent.skipDeeply
		}

		return {
			names,
			rangeStart,
			rangeEnd: 0,
			parent,
			skipDeeply,
		}
	}

	/** Make a global leaf node, it inserts to leaf list,but not push to stack. */
	protected makeGlobalLeaf(name: LeafName, start: number): Leaf {
		return {
			names: [name],
			rangeStart: start,
			rangeEnd: start + name.raw.length,
			parent: undefined,
			skipDeeply: false,
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

		// @at-root a{...}
		let atRoot = oldNames.length > 0
			&& oldNames[0].type === LeafNameType.Command
			&& oldNames[0].raw.startsWith('@at-root')

		let parentFullNames = this.getClosestSelectorFullNames()

		for (let oldName of oldNames) {

			// When not a selector.
			if (oldName.type !== LeafNameType.Selector) {
				names.push(oldName)
			}

			// `a{&-b}` -> `a-b`, not handle joining multiply & when several `&` exist.
			else if (re.test(oldName.full)) {
				if (parentFullNames) {
					for (let parentFullName of parentFullNames) {
						let full = oldName.full.replace(re, parentFullName)
						names.push({
							type: LeafNameType.Selector,
							full,
							raw: oldName.raw,
						})
					}
				}
			}

			// `a{b}` -> `a b`.
			else if (parentFullNames && !atRoot) {
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

			// Sass Interpolation, break names extending.
			if (parent.names.some(n => n.type === LeafNameType.Interpolation)) {
				return null
			}

			// @at-root {...}, breaks too names nesting.
			if (parent.names.some(n => n.type === LeafNameType.Command
				&& n.raw.startsWith('@at-root'))
			) {
				return null
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
		let ranges: CSSDeclarationRange[] = []

		for (let leaf of leaves) {
			let range = this.formatOneLeafToRange(leaf)
			if (range) {
				ranges.push(range)
			}
		}

		return ranges
	}

	/** Leaf -> ranges. */
	protected formatOneLeafToRange(leaf: Leaf): CSSDeclarationRange | null {
		let declNames: CSSDeclarationName[] = []

		for (let leafName of leaf.names) {
			let declName = this.formatLeafNameToDeclarationName(leafName)
			if (declName) {
				declNames.push(declName)
			}
		}

		if (declNames.length === 0) {
			return null
		}

		return {
			names: declNames,

			// `positionAt` uses a binary search algorithm, it should be fast enough,
			// we should have no need to count lines here to mark line and column number here,
			// although it should be faster.
			range: Range.create(this.document.positionAt(leaf.rangeStart), this.document.positionAt(leaf.rangeEnd))
		} as CSSDeclarationRange
	}

	/** Leaf name -> names. */
	private formatLeafNameToDeclarationName({raw, full, type}: LeafName): CSSDeclarationName | null {

		// Can be searched by symbol name.
		if (type === LeafNameType.Command || type === LeafNameType.CSSVariableName) {
			return {
				full,
				mains: null,
			}
		}

		if (type !== LeafNameType.Selector) {
			return null
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

	/** Checks whether having a reference tag `&` in right most part, returns `true` for '&:hover', '&[...]'. */
	private hasSingleReferenceInRightMostDescendant(selector: string): boolean {
		let rightMost = this.getRightMostDescendant(selector)
		return /^&(?:[:\[]|$)/.test(rightMost)
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

	/** Parse for css variable names. */
	protected parseCSSVariableNames(content: string): {name: LeafName, start: number}[] {

		// Match css variable name.
		let re = /(?<![\w-])(--[\w-]+):/g
		let match: RegExpExecArray | null
		let namesStarts: {name: LeafName, start: number}[] = []
		
		while (match = re.exec(content)) {
			let name: LeafName = {
				type: LeafNameType.CSSVariableName,
				raw: match[1],
				full: match[1],
			}

			let start = match.index

			namesStarts.push({
				name,
				start,
			})
		}

		return namesStarts
	}
}
