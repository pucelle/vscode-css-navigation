import {Part, PartType} from './parts'
import {CSSClassInExpressionTokenScanner, CSSClassInExpressionTokenType} from './scanners/css-class-in-expression'


/** 
 * Handle class name expressions in JS like:
 * `let xxxClassName = '...'`
 * `{xxxClassName: ''}`
 * `.xxxClassName="..."`
 */
export namespace ClassNamesInJS {

	let nameMatchRegExp: RegExp | null = null
	let startMatchRegExp: RegExp | null = null


	/** Set variable names wild match expressions. */
	export function initWildNames(wildNames: string[]) {
		let nameSource = wildNames.map(n => n.replace(/\*/g, '\\w*?')).join('|')

		try {
			nameMatchRegExp = new RegExp('^' + nameSource + '$', '')

			let wrappedNameSource = '(?:' + nameSource + ')'

			startMatchRegExp = new RegExp(
				`\\b(?:let|var|const)\\s+${wrappedNameSource}\\s*=\\s*|\\.${wrappedNameSource}\\s*=\\s*|[{,]\\s*${wrappedNameSource}\\s*:\\s*`,
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
		if (!startMatchRegExp) {
			return
		}

		startMatchRegExp.lastIndex = 0

		for (let match = startMatchRegExp.exec(text); match; match = startMatchRegExp.exec(text)) {
			let expressionStart = match.index + match[0].length

			let scanner = new CSSClassInExpressionTokenScanner(
				text.slice(expressionStart),
				start + expressionStart,
				'js',
				true,
				true
			)

			for (let token of scanner.parseToTokens()) {
				if (token.type === CSSClassInExpressionTokenType.ClassName) {
					yield new Part(PartType.Class, token.text, token.start)
				}
			}

			startMatchRegExp.lastIndex = scanner.offset
		}
	}
}
