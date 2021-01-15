import {Range} from 'vscode-languageserver'
import {SimpleSelector} from '../common/simple-selector'
import {HTMLRangeParser, HTMLNamedRange} from '../html/html-range-parser'


export class JSXRangeParser extends HTMLRangeParser {

	/** Parse CSS range for HTML tag attribute. */
	protected getRangesFromAttribute(attribute: string, start: number, end: number): HTMLNamedRange[] {
		let re = /\b(class|id|className)\s*=\s*(?:"(.*?)"|'(.*?)')/g
		let match: RegExpExecArray | null
		let ranges: HTMLNamedRange[] = []

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
