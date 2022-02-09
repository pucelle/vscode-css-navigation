import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSLikeRangeParser, CSSRangeResult} from './css-like'
import {SassRangeParser} from './sass-indented'
export {CSSDeclarationRange as CSSNamedRange} from './css-like'


/** Parse a CSS-like (in `{...}` syntax), or a Sass document (strict indent syntax) to ranges. */
export function parseCSSLikeOrSassRanges(document: TextDocument): CSSRangeResult {
	let languageId = document.languageId

	if (languageId === 'sass') {
		return new SassRangeParser(document).parse()
	}
	else {
		return new CSSLikeRangeParser(document).parse()
	}
}
