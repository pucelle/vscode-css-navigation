import {Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'


export interface HTMLRange {
	name: string
	range: Range
}


export class HTMLRangeParser {

	protected document: TextDocument

	constructor(document: TextDocument) {
		this.document = document
	}

	/** Parse HTML document to ranges. */
	parse(): HTMLRange[] {
		let text = this.document.getText()
		let ranges: HTMLRange[] = []

		let re = /(?:<!--.*?-->|<([\w-]+)(.*?)>)/gs
		/*
			\s* - match white spaces in left
			(?:
				<!--.*?--> - match html comment
				|
				<\w+(.+?)> - match tag, $1 is the arrtibutes
			)
		*/

		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let tag = match[1] as string | undefined
			let attribute = match[2] as string | undefined
			let startIndex = match.index
			let endIndex = re.lastIndex

			if (tag) {
				let tagRange = this.makeRangesFromTag(tag, startIndex, endIndex)
				if (tagRange) {
					ranges.push(tagRange)
				}
			}

			if (attribute) {
				ranges.push(...this.makeRangesFromAttribute(attribute, startIndex, endIndex))
			}
		}
		
		return ranges
	}

	/** Make a CSS range for HTML tag. */
	protected makeRangesFromTag(tag: string, start: number, end: number): HTMLRange | null {
		let selector = SimpleSelector.create(tag)

		// Must be custom tag.
		if (!selector || !SimpleSelector.isCustomTag(selector)) {
			return null
		}

		return {
			name: tag,
			range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
		}
	}

	/** Make a CSS range for HTML tag attribute. */
	protected makeRangesFromAttribute(attribute: string, start: number, end: number): HTMLRange[] {
		let re = /\b(class|id)\s*=\s*(?:"(.*?)"|'(.*?)')/g
		let match: RegExpExecArray | null
		let ranges: HTMLRange[] = []

		while (match = re.exec(attribute)) {
			let attr = match[1].trim()
			let value = match[2] || match[3]

			if (!value) {
				continue
			}

			if (attr === 'class') {
				for (let name of value.split(/\s+/)) {
					name = '.' + name

					if (SimpleSelector.validate(name)) {
						ranges.push({
							name,
							range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
						})
					}
				}
			}
			else {
				let name = '#' + value

				if (SimpleSelector.validate(name)) {
					ranges.push({
						name,
						range: Range.create(this.document.positionAt(start), this.document.positionAt(end))
					})
				}
			}
		}

		return ranges
	}
}
