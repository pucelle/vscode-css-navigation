import {CSSSelectorToken} from '../scanners'
import {Part, PartType} from './part'
import {CSSSelectorDetailedPart, parseDetailedParts} from './part-css-selector-detailed'


/** 
 * Part is normally a tag/class/id selector, or a css variable.
 * For Quick Info and workspace symbol searching.
 */
export class CSSSelectorWrapperPart extends Part {

	static parseFrom(
		jointToken: CSSSelectorToken,
		group: CSSSelectorToken[],
		parents: CSSSelectorWrapperPart[] | undefined,
		breaksSeparatorNesting: boolean,
		definitionEnd: number,
		commandWrapped: boolean,
		comment: string | undefined
	) {
		let formatted = parseFormatted(jointToken, parents, breaksSeparatorNesting)
		let details = parseDetailedParts(group, parents, definitionEnd, commandWrapped)

		return new CSSSelectorWrapperPart(jointToken.text, jointToken.start, definitionEnd, comment, formatted, details)
	}


	/** Previous comment text. */
	readonly comment: string | undefined

	/** 
	 * Formatted selector full name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted: string[]

	/** Detailed parts, use it for completion */
	readonly details: CSSSelectorDetailedPart[]

	/** Primary parts can be used for definition searching. */
	readonly primary: CSSSelectorDetailedPart | undefined

	constructor(
		text: string,
		start: number,
		defEnd: number,
		comment: string | undefined,
		formatted: string[],
		details: CSSSelectorDetailedPart[]
	) {
		super(PartType.CSSSelectorWrapper, text, start, defEnd)

		this.comment = comment
		this.formatted = formatted
		this.details = details
		this.primary = details.find(d => d.primary)
	}

	get textList(): string[] {
		return this.formatted
	}
}


/** Join parent selectors. */
function parseFormatted(jointToken: CSSSelectorToken, parents: CSSSelectorWrapperPart[] | undefined, breaksSeparatorNesting: boolean): string[] {
	return joinSelectorWithParent(jointToken, parents, breaksSeparatorNesting)
}


/** Join parent selectors. */
function joinSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorWrapperPart[] | undefined, breaksSeparatorNesting: boolean): string[] {
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
	else if (!breaksSeparatorNesting) {
		let joint: string[] = []

		for (let parent of parents) {
			for (let parentText of parent.formatted) {
				joint.push(parentText + ' ' + text)
			}
		}
		
		return joint
	}

	// `a{@at-root b}` -> `b`
	else {
		return [text]
	}
}

