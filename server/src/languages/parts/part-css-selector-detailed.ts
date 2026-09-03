import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {BaseService} from '../services'
import {Part, PartType} from './part'
import {PartConvertor} from './part-convertor'
import {CSSSelectorWrapperPart} from './part-css-selector-wrapper'
import {escapedCSSSelector} from './utils'
import {normalizeAttributeSelector} from './attribute-selector'


/** Detailed part, normally contains a tag/class/id selector. */
export class CSSSelectorDetailedPart extends Part {

	/** 
	 * Formatted selector name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted!: string[]

	/** 
	 * Whether current part is primary part.
	 * Only primary part will match as selector.
	 * .a.b: both primary.
	 * .a .b: .b is primary.
	 */
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

	protected override escapeText(text: string): string {
		return escapedCSSSelector(text)
	}

	isTextMatch(matchPart: Part) {
		return this.formatted.some(text => text === matchPart.escapedText)
	}

	isTextExpMatch(re: RegExp) {
		return this.formatted.some(text => re.test(text))
	}

	/** Get the owning selector wrapper, which is also its contextual selector container. */
	getWrapper(service: BaseService): CSSSelectorWrapperPart | null {
		let wrapperPart = service.findPartAt(this.start) as CSSSelectorWrapperPart | undefined
		return wrapperPart ?? null
	}
}


/** Parse a CSS selector name to detailed part. */
export function parseDetailedParts(
	group: CSSSelectorToken[],
	parents: CSSSelectorWrapperPart[] | undefined,
	definitionEnd: number,
	commandWrapped: boolean
): CSSSelectorDetailedPart[] {
	// `.a.b`, both matchers.
	// `.a .b`, .a is filter, .b is matcher.
	// `.a:hover`, .a is matcher, :hover is decorator.
	// `.a::before`, .a is filter too, ::before is matcher.

	let matcherFromIndex = group.findLastIndex(token => token.type === CSSSelectorTokenType.Combinator
		|| token.type === CSSSelectorTokenType.Separator)

	// Check the pseudo index after matcher.
	let pseudoIndex = -1
	for (let i = matcherFromIndex + 1; i < group.length; i++) {
		let token = group[i]
		if (token.type === CSSSelectorTokenType.PseudoElement) {
			pseudoIndex = i
		}
	}

	let details: CSSSelectorDetailedPart[] = []
	let independent = commandWrapped || group.length === 1

	for (let i = 0; i < group.length; i++) {
		let token = group[i]

		let beDetailed = token.type === CSSSelectorTokenType.Tag
			|| token.type === CSSSelectorTokenType.Nesting
			|| token.type === CSSSelectorTokenType.Class
			|| token.type === CSSSelectorTokenType.Id
			|| token.type === CSSSelectorTokenType.Attribute
		
		if (!beDetailed) {
			continue
		}

		let formatted = token.type === CSSSelectorTokenType.Attribute
			? [normalizeAttributeSelector(token.text) ?? '']
			: joinMainReferenceSelectorWithParent(token, parents)
			
		if (formatted.length === 0) {
			continue
		}

		formatted = formatted.map(escapedCSSSelector)

		let type = getDetailedPartType(token.type, formatted)
		let primary = i > matcherFromIndex && pseudoIndex === -1
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
	else if (type === CSSSelectorTokenType.Attribute) {
		return PartType.CSSSelectorAttribute
	}
	else {
		return PartConvertor.getCSSSelectorDetailedTypeByText(formatted[0])
	}
}
