import {Part, PartType} from './parts'
import {Picker} from './trees'


/** 
 * Handle class name expressions in JS like:
 * `let xxxClassName = '...'`
 * `{xxxClassName: ''}`
 * `.xxxClassName="..."`
 */
export namespace ClassNamesInJS {

	let nameMatchRegExp: RegExp | null = null
	let expressionMathRegExp: RegExp | null = null


	/** Set variable names wild match expressions. */
	export function initWildNames(wildNames: string[]) {
		let nameSource = wildNames.map(n => n.replace(/\*/g, '\\w*?')).join('|')

		try {
			nameMatchRegExp = new RegExp('^' + nameSource + '$', '')

			let wrappedNameSource = '(?:' + nameSource + ')'

			expressionMathRegExp = new RegExp(
				`\\b(?:let|var|const)\\s+${wrappedNameSource}\\s*=\\s*["'\`]([\\w-]*?)["'\`]|\\.${wrappedNameSource}\\s*=\\s*["'\`]([\\w-]*?)["'\`]|[{,]\\s*${wrappedNameSource}\\s*:\\s*["'\`]([\\w-]*?)["'\`]`,
				'gi'
			)
		}
		catch { /* ignore invalid user-supplied wild-name pattern; leave the regex unset */ }
	}


	/** Test whether be wild name, and start and end positions both match. */
	export function isWildName(name: string): boolean {
		return nameMatchRegExp?.test(name) ?? false
	}


	/** Walk for variable parts of `var xxxClassNameXXX = `... */
	export function* walkParts(text: string, start: number = 0): Iterable<Part> {
		if (!expressionMathRegExp) {
			return
		}

		let matches = Picker.locateAllMatches(
			text,
			expressionMathRegExp,
			[1, 2, 3]
		)

		for (let match of matches) {
			let subMatch = match[1] ?? match[2] ?? match[3]
			if (subMatch) {
				yield (new Part(PartType.Class, subMatch.text, subMatch.start + start)).trim()
			}
		}
	}
}