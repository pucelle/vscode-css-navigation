import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSLikeRangeParser, CSSRangeParseResult} from './css-like'
import {SassRangeParser} from './sass-indented'
export {CSSNamedRange} from './css-like'


/** Parse a CSS document to ranges. */
export function parseCSSRange(document: TextDocument): CSSRangeParseResult {
	let languageId = document.languageId

	if (languageId === 'sass') {
		return new SassRangeParser(document).parse()
	}
	else {
		return new CSSLikeRangeParser(document).parse()
	}
}