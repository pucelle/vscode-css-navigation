import {CSSSelectorToken, CSSSelectorTokenType} from '../scanners'
import {Part, PartType} from './part'


/** Part is normally a tag/class/id selector, or a css variable. */
export class CSSSelectorPart extends Part {
	
	/** Previous comment text. */
	readonly comment: string | undefined

	/** 
	 * Formatted selector full name can be used for workspace symbol searching.
	 * `&-name` -> `.parent-name`
	 */
	readonly formatted!: string[]

	/** Detailed parts can be used for completion / definition / quick info searching. */
	readonly details!: Part[]

	constructor(tokens: CSSSelectorToken[], jointToken: CSSSelectorToken, parents: CSSSelectorPart[], comment: string | undefined) {
		super(PartType.CSSSelector, jointToken.text, jointToken.start)

		this.comment = comment
		this.formatted = this.parseFormatted(jointToken, parents)
		this.details = this.parseDetails(tokens)
	}

	/** Join parent selectors. */
	private parseFormatted(jointToken: CSSSelectorToken, parents: CSSSelectorPart[]): string[] {
		let name = jointToken.text
		let re = /&/g

		if (parents.length === 0) {
			return [name]
		}

		// `a{&-b}` -> `a-b`, not handle joining multiply & when several `&` exist.
		if (re.test(name)) {
			let names: string[] = []

			for (let parent of parents) {
				for (let item of parent.formatted) {
					names.push(name.replace(re, item))
				}
			}
			
			return names
		}

		// `a{b}` -> `a b`.
		else {
			let names: string[] = []

			for (let parent of parents) {
				for (let item of parent.formatted) {
					names.push(item + ' ' + name)
				}
			}
			
			return names
		}
	}

	/** Parse a CSS selector name to details. */
	private parseDetails(tokens: CSSSelectorToken[]): Part[] {

	}

	/**
	 * `a b` -> `b`
	 * `a + b` -> `b`
	 * `a:hover` -> `a`
	 * `.a.b` -> `.b`
	 * `.a::before` -> `[]`
	 */
	private parseMainTokenOfGroup(group: CSSSelectorToken[]): CSSSelectorToken | null {
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
			|| main.type === CSSSelectorTokenType.Nested
			|| main.type === CSSSelectorTokenType.ClassName
			|| main.type === CSSSelectorTokenType.IdName
		) {
			return main
		}

		return null
	}
}