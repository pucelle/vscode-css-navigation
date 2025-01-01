import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {Part, PartType} from './part'
import {LocationLink, Range} from 'vscode-languageserver'


/** 
 * Part is normally a tag/class/id selector, or a css variable.
 * For Quick Info and workspace symbol searching.
 */
export class CSSSelectorPart extends Part {

	static parseFrom(
		jointToken: CSSSelectorToken,
		group: CSSSelectorToken[],
		parents: CSSSelectorPart[] | undefined,
		definitionEnd: number,
		commandWrapped: boolean,
		comment: string | undefined
	) {
		let formatted = parseFormatted(jointToken, parents)
		let detail = parseDetails(group, parents, definitionEnd, commandWrapped)

		return new CSSSelectorPart(jointToken.text, jointToken.start, definitionEnd, comment, formatted, detail)
	}


	/** Previous comment text. */
	readonly comment: string | undefined

	/** 
	 * Formatted selector full name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted: string[]

	/** Detailed parts can be used for completion / definition searching. */
	readonly detail: CSSSelectorMainPart | null

	constructor(
		text: string,
		start: number,
		definitionEnd: number,
		comment: string | undefined,
		formatted: string[],
		detail: CSSSelectorMainPart | null
	) {
		super(PartType.CSSSelector, text, start, definitionEnd)

		this.comment = comment
		this.formatted = formatted
		this.detail = detail
	}

	get textList(): string[] {
		return this.formatted
	}

	translate(offset: number): this {
		this.start += offset
		this.defEnd += offset

		if (this.detail) {
			this.detail.translate(offset)
		}

		return this
	}

	isMatch(matchPart: Part): boolean {
		if (!this.detail) {
			return false
		}

		return this.detail.isMatch(matchPart)
	}

	isTextExpMatch(re: RegExp): boolean {
		return this.formatted.some(text => re.test(text))
	}

	toLocationLink(document: TextDocument, fromPart: Part, fromDocument: TextDocument) {
		let selectionRange = this.detail ? this.detail.toRange(document) : this.toRange(document)
		let end = this.defEnd > -1 ? this.defEnd : this.end

		// Selection range doesn't work as expected, finally cursor move to definition start.
		let definitionRange = Range.create(selectionRange.start, document.positionAt(end))

		let fromRange = fromPart.toRange(fromDocument)

		return LocationLink.create(document.uri, definitionRange, selectionRange, fromRange)
	}
}


/** Main part for a tag/class/id selector. */
export class CSSSelectorMainPart extends Part {

	/** 
	 * Formatted selector name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted!: string[]

	/** 
	 * Whether current selector is the main selector,
	 * which means it has no other unioned selectors,
	 * and not been nested like `.a .b`,
	 * and not been wrapped by commands.
	 */
	readonly independent: boolean

	constructor(type: PartType, text: string, start: number, definitionEnd: number, formatted: string[], independent: boolean) {
		super(type, text, start, definitionEnd)
		this.independent = independent
		this.formatted = formatted
	}

	get textList(): string[] {
		return this.formatted
	}

	isMatch(matchPart: Part) {
		return this.formatted.some(text => text === matchPart.text)
	}

	isTextExpMatch(re: RegExp) {
		return this.formatted.some(text => re.test(text))
	}
}




/** Join parent selectors. */
function parseFormatted(jointToken: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
	return joinSelectorWithParent(jointToken, parents)
}


/** Join parent selectors. */
function joinSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
	let text = token.text
	let re = /&/g

	if (!parents || parents.length === 0) {
		return [text]
	}

	// `a{&-b}` -> `a-b`.
	if (re.test(text)) {
		let joint: string[] = []

		for (let parent of parents) {
			for (let parentText of parent.formatted) {
				joint.push(text.replace(re, parentText))
			}
		}
		
		return joint
	}

	// `a{b}` -> `a b`.
	else {
		let joint: string[] = []

		for (let parent of parents) {
			for (let parentText of parent.formatted) {
				joint.push(parentText + ' ' + text)
			}
		}
		
		return joint
	}
}


/** Join parent selectors, but only handle `&-` joining. */
function joinMainReferenceSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
	let text = token.text
	let re = /&/g

	// `a{&-b}` -> `a-b`, not handle joining multiply & when several `&` exist.
	if (re.test(text)) {
		if (!parents) {
			return [text]
		}

		let joint: string[] = []

		for (let parent of parents) {
			if (!parent.detail) {
				continue
			}

			for (let detailFormatted of parent.detail.formatted) {
				joint.push(text.replace(re, detailFormatted))
			}
		}
		
		return joint
	}
	else {
		return [text]
	}
}


/** Parse a CSS selector name to detail. */
function parseDetails(
	group: CSSSelectorToken[],
	parents: CSSSelectorPart[] | undefined,
	definitionEnd: number,
	commandWrapped: boolean
): CSSSelectorMainPart | null {
	let mainToken = parsePrimaryTokenOfGroup(group)
	if (!mainToken) {
		return null
	}

	let independent = commandWrapped || group.length === 1
	let formatted = joinMainReferenceSelectorWithParent(mainToken, parents)

	if (formatted.length === 0) {
		return null
	}

	let type = mainToken.type === CSSSelectorTokenType.Tag
		? PartType.CSSSelectorMainTag
		: mainToken.type === CSSSelectorTokenType.Id
		? PartType.CSSSelectorMainId
		: mainToken.type === CSSSelectorTokenType.Class
		? PartType.CSSSelectorMainClass
		: Part.getCSSSelectorTypeByText(formatted[0])

	return new CSSSelectorMainPart(type, mainToken.text, mainToken.start, definitionEnd, formatted, independent)
}


/**
 * `a b` -> `b`
 * `a + b` -> `b`
 * `a:hover` -> `a`
 * `.a.b` -> `.b`
 * `.a::before` -> `null`
 */
function parsePrimaryTokenOfGroup(group: CSSSelectorToken[]): CSSSelectorToken | null {
	let lastCombinatorIndex = group.findLastIndex(item => {
		return item.type === CSSSelectorTokenType.Combinator
			|| item.type === CSSSelectorTokenType.Separator
	})
	
	if (lastCombinatorIndex !== -1) {
		group = group.slice(lastCombinatorIndex + 1)
	}

	let main = group.findLast(item => item.type === CSSSelectorTokenType.Tag
		|| item.type === CSSSelectorTokenType.Nesting
		|| item.type === CSSSelectorTokenType.Class
		|| item.type === CSSSelectorTokenType.Id) ?? null

	return main
}
