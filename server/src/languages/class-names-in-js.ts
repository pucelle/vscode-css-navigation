import {Part, PartType} from './parts'
import {CSSClassInExpressionTokenScanner, CSSClassInExpressionTokenType} from './scanners/css-class-in-expression'
import {JSStringLocation, JSTokenScanner, JSTokenType, isWithinJSNonCode} from './scanners/js'


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
		catch {
			//ignore invalid user-supplied wild-name pattern; leave the regex unset.
		}
	}


	/** Test whether be wild name, and start and end positions both match. */
	export function isWildName(name: string): boolean {
		return nameMatchRegExp?.test(name) ?? false
	}


	/** Walk for variable parts of `var xxxClassNameXXX = `... */
	export function* walkParts(
		text: string,
		start: number = 0,
		stringLocations?: readonly JSStringLocation[],
		commentLocations?: readonly JSStringLocation[]
	): Iterable<Part> {
		if (!startMatchRegExp) {
			return
		}

		// Script-tree callers reuse the locations collected during their existing scan.
		// Standalone callers (including HTML attribute expressions) need the same protection.
		if (!stringLocations || !commentLocations) {
			let tokens = [...new JSTokenScanner(text, start, 'js').parseToTokens()]
			stringLocations ??= tokens.flatMap(token => token.type === JSTokenType.Script ? token.stringLocations ?? [] : [{start: token.start, end: token.end}])
			commentLocations ??= tokens.flatMap(token => token.commentLocations ?? [])
		}

		startMatchRegExp.lastIndex = 0

		for (let match = startMatchRegExp.exec(text); match; match = startMatchRegExp.exec(text)) {
			let expressionStart = match.index + match[0].length
			if (isWithinJSNonCode(start + match.index, start + expressionStart, stringLocations, commentLocations)) {
				continue
			}

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

			startMatchRegExp.lastIndex = expressionStart + scanner.offset
		}
	}
}
