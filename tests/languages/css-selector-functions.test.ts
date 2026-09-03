import {describe, expect, it} from 'vitest'
import {TextDocument} from '../../server/node_modules/vscode-languageserver-textdocument'
import {CSSSelectorTokenScanner, CSSSelectorTokenType} from '../../server/src/languages/scanners'
import {CSSService, HTMLService, PartConvertor, PartType} from '../../server/src/languages'


const configuration = {
	enableClassNameDefinitionDiagnostic: false,
	enableClassNameReferenceDiagnostic: false,
} as any


describe(':is() and :where() selectors', () => {
	it('recursively scans selectors in separate embedded branches', () => {
		let text = `.root:is(.a, :where(.b, #c))`
		
		let tokens = [...new CSSSelectorTokenScanner(text, 0, 'css').parseToTokens()]
			.filter(token => token.type === CSSSelectorTokenType.Class || token.type === CSSSelectorTokenType.Id)

		expect(tokens.map(token => [token.text, token.embeddedSelectorPath?.length ?? 0])).toEqual([
			['.root', 0],
			['.a', 1],
			['.b', 2],
			['#c', 2],
		])
		expect(tokens[2].embeddedSelectorPath).not.toEqual(tokens[3].embeddedSelectorPath)
	})

	it('marks every detailed selector inside the functions as non-primary', () => {
		let cssText = `.root:is(.a, :where(.b, #c), [disabled]) {}`
		let document = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		let service = new CSSService(document, configuration)

		let details = [
			service.findDetailedPartAt(cssText.indexOf('.root') + 1)!,
			service.findDetailedPartAt(cssText.indexOf('.a') + 1)!,
			service.findDetailedPartAt(cssText.indexOf('.b') + 1)!,
			service.findDetailedPartAt(cssText.indexOf('#c') + 1)!,
			service.findDetailedPartAt(cssText.indexOf('[disabled]') + 1)!,
		]

		expect(details.map(part => [part.escapedText, part.isSelectorDetailedType() && part.primary])).toEqual([
			['.root', true],
			['.a', false],
			['.b', false],
			['#c', false],
			['[disabled]', false],
		])
	})

	it('keeps contextual selectors within the selected alternative branch', () => {
		let cssText = `.root:is(.a.b, .other) {}`
		let document = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		let service = new CSSService(document, configuration)
		let innerPart = service.findDetailedPartAt(cssText.indexOf('.b') + 1)!
		let outerPart = service.findDetailedPartAt(cssText.indexOf('.root') + 1)!

		expect(service.getContextualDefMatchParts(innerPart).map(part => part.escapedText)).toEqual(['.root', '.a'])
		expect(service.getContextualDefMatchParts(outerPart)).toEqual([])
	})

	it('uses embedded selectors as reference sources but not definitions', () => {
		let cssText = `.root:is(.a.b, .other) {}`
		let htmlText = `<div class="root b"></div>\n<div class="root a b"></div>`
		let cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		let cssService = new CSSService(cssDocument, configuration)
		let htmlService = new HTMLService(htmlDocument, configuration)
		let innerPart = cssService.findDetailedPartAt(cssText.indexOf('.b') + 1)!

		let matches = htmlService.findReferenceMatchParts(
			PartConvertor.toDefinitionMode(innerPart),
			innerPart,
			cssService.getContextualDefMatchParts(innerPart),
		)

		expect(matches.normal).toHaveLength(2)
		expect(matches.contextual).toHaveLength(1)

		let htmlClassPart = htmlService.findPartAt(htmlText.indexOf('a b'))!
		let definitions = cssService.findDefinitionMatchParts(PartConvertor.toDefinitionMode(htmlClassPart))
		expect(definitions.normal).toHaveLength(0)
	})

	it('discovers embedded selectors in querySelector calls', () => {
		let jsText = `document.querySelector(':is(.a, :where(.b, #selected))')`
		let document = TextDocument.create('file:///workspace/index.js', 'javascript', 1, jsText)
		let service = new HTMLService(document, configuration)

		expect(service.getPartsByType(PartType.CSSSelectorQueryClass).map(part => part.escapedText)).toEqual(['.a', '.b'])
		expect(service.getPartsByType(PartType.CSSSelectorQueryId).map(part => part.escapedText)).toEqual(['#selected'])
	})

	it('does not hang on an incomplete embedded selector list', () => {
		let tokens = [...new CSSSelectorTokenScanner(`:is(.a, :where(.b`, 0, 'css').parseToTokens()]
		expect(tokens).toEqual([])
	})
})
