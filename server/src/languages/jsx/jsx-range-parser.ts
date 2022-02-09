import {Range} from 'vscode-languageserver'
import {SimpleSelector} from '../common/simple-selector'
import {HTMLRangeParser, HTMLRange} from '../html/html-range-parser'


export class JSXRangeParser extends HTMLRangeParser {

	/** 
	 * Parse CSS ranges for HTML tag attribute.
	 * It parses `className=...` additional.
	 * It doesn't support computed React syntax like `class={...}`
	 */
	protected makeRangesFromAttribute(attribute: string, start: number, end: number): HTMLRange[] {
		let re = /\b(class|id|className)(?:[\S]*?)\s*=\s*(?:"(.*?)"|'(.*?)')/g
		let match: RegExpExecArray | null
		let ranges: HTMLRange[] = []

		while (match = re.exec(attribute)) {
			let attr = match[1].trim()
			let value = match[2] || match[3]

			if (!value) {
				continue
			}

			if (attr === 'class' || attr === 'className') {
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
