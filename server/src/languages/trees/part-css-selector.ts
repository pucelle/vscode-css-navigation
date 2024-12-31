import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {Part, PartType} from './part'


/** 
 * Part is normally a tag/class/id selector, or a css variable.
 * For Quick Info and workspace symbol searching.
 */
export class CSSSelectorPart extends Part {

	readonly closureStart
	readonly closureEnd
	
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
		group: CSSSelectorToken[],
		jointToken: CSSSelectorToken,
		parents: CSSSelectorPart[] | undefined,
		commandWrapped: boolean,
		closureStart: number,
		closureEnd: number,
		comment: string | undefined
	) {
		super(PartType.CSSSelector, jointToken.text, jointToken.start)

		this.closureStart = closureStart
		this.closureEnd = closureEnd
		this.comment = comment
		this.formatted = this.parseFormatted(jointToken, parents)
		this.detail = this.parseDetails(group, parents, commandWrapped)
	}

	get textList(): string[] {
		return this.formatted
	}

	/** Join parent selectors. */
	private parseFormatted(jointToken: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
		return this.joinSelectorWithParent(jointToken, parents)
	}

	/** Join parent selectors. */
	private joinSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
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
	private joinMainReferenceSelectorWithParent(token: CSSSelectorToken, parents: CSSSelectorPart[] | undefined): string[] {
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
	private parseDetails(
		group: CSSSelectorToken[],
		parents: CSSSelectorPart[] | undefined,
		commandWrapped: boolean
	): CSSSelectorMainPart | null {
		let mainToken = this.parsePrimaryTokenOfGroup(group)
		if (!mainToken) {
			return null
		}

		let independent = commandWrapped || group.length === 1
		let formatted = this.joinMainReferenceSelectorWithParent(mainToken, parents)

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

		return new CSSSelectorMainPart(type, mainToken.text, mainToken.start, formatted, independent)
	}

	/**
	 * `a b` -> `b`
	 * `a + b` -> `b`
	 * `a:hover` -> `a`
	 * `.a.b` -> `.b`
	 * `.a::before` -> `null`
	 */
	private parsePrimaryTokenOfGroup(group: CSSSelectorToken[]): CSSSelectorToken | null {
		let lastCombinatorIndex = group.findLastIndex(item => {
			return item.type === CSSSelectorTokenType.Combinator
				|| item.type === CSSSelectorTokenType.Separator
		})
		
		if (lastCombinatorIndex !== -1) {
			group = group.slice(lastCombinatorIndex + 1)
		}

		let main = group.length > 0 ? group[group.length - 1] : null
		if (!main) {
			return null
		}
		
		if (main.type === CSSSelectorTokenType.Tag
			|| main.type === CSSSelectorTokenType.Nesting
			|| main.type === CSSSelectorTokenType.Class
			|| main.type === CSSSelectorTokenType.Id
		) {
			return main
		}

		return null
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

	constructor(type: PartType, text: string, start: number, formatted: string[], independent: boolean) {
		super(type, text, start)
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