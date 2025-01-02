import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {Part, PartType} from './part'
import {PartConvertor} from './part-convertor'


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
		let {detailed, primary} = parseDetailedParts(group, parents, definitionEnd, commandWrapped)

		return new CSSSelectorPart(jointToken.text, jointToken.start, definitionEnd, comment, formatted, detailed, primary)
	}


	/** Previous comment text. */
	readonly comment: string | undefined

	/** 
	 * Formatted selector full name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted: string[]

	/** Detailed parts, use it for completion */
	readonly detailed: CSSSelectorDetailedPart[]

	/** Primary parts can be used for definition searching. */
	readonly primary: CSSSelectorDetailedPart | null

	constructor(
		text: string,
		start: number,
		defEnd: number,
		comment: string | undefined,
		formatted: string[],
		detailed: CSSSelectorDetailedPart[],
		primary: CSSSelectorDetailedPart | null
	) {
		super(PartType.CSSSelector, text, start, defEnd)

		this.comment = comment
		this.formatted = formatted
		this.detailed = detailed
		this.primary = primary
	}

	get textList(): string[] {
		return this.formatted
	}

	get mayPrimaryTextList(): string[] {
		if (this.primary) {
			return this.primary.textList
		}
		else {
			return this.textList
		}
	}

	isMatch(matchPart: Part): boolean {
		return this.isTypeMatch(matchPart)
			&& this.formatted.some(text => text === matchPart.text)
	}

	isTextExpMatch(re: RegExp): boolean {
		return this.formatted.some(text => re.test(text))
	}

	isMayPrimaryTypeMatch(matchPart: Part): boolean {
		if (!this.primary) {
			return false
		}

		return this.primary.isTypeMatch(matchPart)
	}

	isMayPrimaryMatch(matchPart: Part): boolean {
		if (!this.primary) {
			return false
		}

		return this.primary.isMatch(matchPart)
	}

	isMayPrimaryTextExpMatch(re: RegExp): boolean {
		if (!this.primary) {
			return false
		}

		return this.primary.isTextExpMatch(re)
	}
}


/** Detailed part, normally contains a tag/class/id selector. */
export class CSSSelectorDetailedPart extends Part {

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
			if (!parent.primary) {
				continue
			}

			for (let primaryFormatted of parent.primary.formatted) {
				joint.push(text.replace(re, primaryFormatted))
			}
		}
		
		return joint
	}
	else {
		return [text]
	}
}


/** Parse a CSS selector name to detailed part. */
function parseDetailedParts(
	group: CSSSelectorToken[],
	parents: CSSSelectorPart[] | undefined,
	definitionEnd: number,
	commandWrapped: boolean
): {detailed: CSSSelectorDetailedPart[], primary: CSSSelectorDetailedPart | null} {
	let detailedTokens = group.filter(item => item.type === CSSSelectorTokenType.Tag
		|| item.type === CSSSelectorTokenType.Nesting
		|| item.type === CSSSelectorTokenType.Class
		|| item.type === CSSSelectorTokenType.Id)
		
	let primaryToken = detailedTokens.length > 0 ? detailedTokens[detailedTokens.length - 1] : null
	let primaryTokenIndex = primaryToken ? group.lastIndexOf(primaryToken) : -1

	// Has combinator or separator followed.
	// `a b` -> `b`
	// `a + b` -> `b`
	// `a:hover` -> `a`
	// `.a.b` -> `.b`
	// `.a::before` -> `null`
	if (primaryTokenIndex !== -1) {
		for (let i = primaryTokenIndex + 1; i < group.length; i++) {
			let item = group[i]

			if (item.type === CSSSelectorTokenType.Combinator
				|| item.type === CSSSelectorTokenType.Separator
				|| item.type === CSSSelectorTokenType.PseudoElement
			) {
				primaryToken = null
				break
			}
		}
	}

	let detailed: CSSSelectorDetailedPart[] = []
	let primary: CSSSelectorDetailedPart | null = null
	let independent = commandWrapped || group.length === 1

	for (let token of detailedTokens) {
		let formatted = joinMainReferenceSelectorWithParent(token, parents)
		if (formatted.length === 0) {
			continue
		}

		let type = getDetailedPartType(token.type, formatted)
		let part = new CSSSelectorDetailedPart(type, token.text, token.start, definitionEnd, formatted, independent)

		detailed.push(part)

		if (token === primaryToken) {
			primary = part
		}
	}

	return {detailed, primary}
}


/** Get part type by detailed token type, and formatted text. */
function getDetailedPartType(type: CSSSelectorTokenType, formatted: string[]): PartType {
	if (type === CSSSelectorTokenType.Tag) {
		return PartType.CSSSelectorTag
	}
	else if (type === CSSSelectorTokenType.Id) {
		return PartType.CSSSelectorId
	}
	else if (type === CSSSelectorTokenType.Class) {
		return PartType.CSSSelectorClass
	}
	else {
		return PartConvertor.getCSSSelectorTypeByText(formatted[0])
	}
}
