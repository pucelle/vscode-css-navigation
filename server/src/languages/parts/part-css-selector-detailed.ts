import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {Part, PartType} from './part'
import {PartConvertor} from './part-convertor'
import {CSSSelectorWrapperPart} from './part-css-selector-wrapper'


/** Detailed part, normally contains a tag/class/id selector. */
export class CSSSelectorDetailedPart extends Part {

	/** 
	 * Formatted selector name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted!: string[]

	/** Whether current part is primary part. */
	readonly primary: boolean

	/** 
	 * Whether current selector is the main selector,
	 * which means it has no other unioned selectors,
	 * and not been nested like `.a .b`,
	 * and not been wrapped by commands.
	 */
	readonly independent: boolean

	constructor(
		type: PartType,
		text: string,
		start: number,
		definitionEnd: number,
		formatted: string[],
		primary: boolean,
		independent: boolean
	) {
		super(type, text, start, definitionEnd)
		this.formatted = formatted
		this.primary = primary
		this.independent = independent
	}

	isTextMatch(matchPart: Part) {
		return this.formatted.some(text => text === matchPart.text)
	}

	isTextExpMatch(re: RegExp) {
		return this.formatted.some(text => re.test(text))
	}
}


/** Parse a CSS selector name to detailed part. */
export function parseDetailedParts(
	group: CSSSelectorToken[],
	parents: CSSSelectorWrapperPart[] | undefined,
	definitionEnd: number,
	commandWrapped: boolean
): CSSSelectorDetailedPart[] {
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

	let details: CSSSelectorDetailedPart[] = []
	let independent = commandWrapped || group.length === 1

	for (let token of detailedTokens) {
		let formatted = joinMainReferenceSelectorWithParent(token, parents)
		if (formatted.length === 0) {
			continue
		}

		let type = getDetailedPartType(token.type, formatted)
		let primary = token === primaryToken
		let part = new CSSSelectorDetailedPart(type, token.text, token.start, definitionEnd, formatted, primary, independent)

		details.push(part)
	}

	return details
}


/** Join parent selectors, but only handle `&-` joining. */
function joinMainReferenceSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorWrapperPart[] | undefined): string[] {
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
