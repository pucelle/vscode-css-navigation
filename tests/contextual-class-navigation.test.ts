import {describe, expect, it} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {CSSService, CSSServiceMap, HTMLService, HTMLServiceMap, PartConvertor, PartType} from '../server/src/languages'


const configuration = {
	enableClassNameDefinitionDiagnostic: false,
	enableClassNameReferenceDiagnostic: false,
} as any


function locationStart(document: TextDocument, range: {start: {line: number, character: number}}): number {
	return document.offsetAt(range.start)
}


describe('contextual class navigation', () => {
	it('prefers a selector whose tag, id, and classes match the HTML tag container', () => {
		const htmlText = `<div id="root" class="a b"></div>`
		const cssText = `.a {}\nspan#root.a.b {}\ndiv#root.a.b {}`
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const cssService = new CSSService(cssDocument, configuration)
		const fromPart = htmlService.findPartAt(htmlText.indexOf('a b'))!
		const contextMatchParts = htmlService.getContextualDefMatchParts(fromPart)

		const definitions = cssService.findDefinitionMatchParts(PartConvertor.toDefinitionMode(fromPart), contextMatchParts)

		expect(definitions.normal).toHaveLength(3)
		expect(definitions.contextual).toHaveLength(1)
		expect(definitions.contextual[0].start).toBe(cssText.indexOf('.a', cssText.indexOf('div#root')))
	})

	it('falls back to a normal class definition when no compound selector matches', () => {
		const htmlText = `<div class="a b"></div>`
		const cssText = `.a {}\n.a.c {}`
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const cssService = new CSSService(cssDocument, configuration)
		const fromPart = htmlService.findPartAt(htmlText.indexOf('a b'))!
		const contextMatchParts = htmlService.getContextualDefMatchParts(fromPart)

		const definitions = cssService.findDefinitionMatchParts(PartConvertor.toDefinitionMode(fromPart), contextMatchParts)

		expect(definitions.contextual).toHaveLength(0)
		expect(definitions.normal.map(part => part.start)).toEqual([
			cssText.indexOf('.a {}'),
			cssText.indexOf('.a.c'),
		])
	})

	it('chooses contextual definition matches after collecting raw matches from every service', () => {
		const htmlText = `<div class="a b"></div>`
		const firstCSSText = `.a {}`
		const secondCSSText = `.a.b {}`
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const firstCSSDocument = TextDocument.create('file:///workspace/first.css', 'css', 1, firstCSSText)
		const secondCSSDocument = TextDocument.create('file:///workspace/second.css', 'css', 1, secondCSSText)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const firstCSSService = new CSSService(firstCSSDocument, configuration)
		const secondCSSService = new CSSService(secondCSSDocument, configuration)
		const fromPart = htmlService.findPartAt(htmlText.indexOf('a b'))!
		const serviceMap = Object.create(CSSServiceMap.prototype) as CSSServiceMap

		const definitions = serviceMap.findDefinitionsFromServices(
			[firstCSSService, secondCSSService],
			PartConvertor.toDefinitionMode(fromPart),
			fromPart,
			htmlDocument,
			htmlService.getContextualDefMatchParts(fromPart),
		)

		expect(definitions).toHaveLength(1)
		expect(definitions[0].targetUri).toBe(secondCSSDocument.uri)
		expect(locationStart(secondCSSDocument, definitions[0].targetSelectionRange)).toBe(secondCSSText.indexOf('.a'))
	})

	it('prefers references containing every class in the source selector compound', () => {
		const cssText = `div#root.a.b {}`
		const htmlText = [
			`<span id="root" class="a b"></span>`,
			`<div id="other" class="a b"></div>`,
			`<div id="root" class="a"></div>`,
			`<div id="root" class="a b"></div>`,
		].join('\n')
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const cssService = new CSSService(cssDocument, configuration)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const fromPart = cssService.findDetailedPartAt(cssText.indexOf('.a') + 1)!
		const contextMatchParts = cssService.getContextualDefMatchParts(fromPart)
		const references = htmlService.findReferenceMatchParts(PartConvertor.toDefinitionMode(fromPart), fromPart, contextMatchParts)

		expect(references.normal).toHaveLength(4)
		expect(references.contextual).toHaveLength(1)
		expect(references.contextual[0].start).toBe(htmlText.lastIndexOf('a b'))
	})

	it('chooses contextual reference matches after collecting raw matches from every service', () => {
		const cssText = `.a.b {}`
		const firstHTMLText = `<div class="a"></div>`
		const secondHTMLText = `<div class="a b"></div>`
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const firstHTMLDocument = TextDocument.create('file:///workspace/first.html', 'html', 1, firstHTMLText)
		const secondHTMLDocument = TextDocument.create('file:///workspace/second.html', 'html', 1, secondHTMLText)
		const cssService = new CSSService(cssDocument, configuration)
		const firstHTMLService = new HTMLService(firstHTMLDocument, configuration)
		const secondHTMLService = new HTMLService(secondHTMLDocument, configuration)
		const fromPart = cssService.findDetailedPartAt(cssText.indexOf('.a') + 1)!
		const serviceMap = Object.create(HTMLServiceMap.prototype) as HTMLServiceMap

		const references = serviceMap.findReferencesFromServices(
			[firstHTMLService, secondHTMLService],
			PartConvertor.toDefinitionMode(fromPart),
			fromPart,
			cssService.getContextualDefMatchParts(fromPart),
		)

		expect(references).toHaveLength(1)
		expect(references[0].uri).toBe(secondHTMLDocument.uri)
		expect(locationStart(secondHTMLDocument, references[0].range)).toBe(secondHTMLText.indexOf('a b'))
	})

	it('gets CSS context by looking up the owning selector wrapper and its children', () => {
		const cssText = `div#root.a.b {}`
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const cssService = new CSSService(cssDocument, configuration)
		const fromPart = cssService.findDetailedPartAt(cssText.indexOf('.a') + 1)!

		expect(cssService.getContextualDefMatchParts(fromPart).map(part => [part.type, part.escapedText])).toEqual([
			[PartType.CSSSelectorTag, 'div'],
			[PartType.CSSSelectorId, '#root'],
			[PartType.CSSSelectorClass, '.b'],
		])
	})

	it('keeps ancestor selector parts from the same selector wrapper', () => {
		const cssText = `.a .b {}`
		const cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		const cssService = new CSSService(cssDocument, configuration)
		const fromPart = cssService.findDetailedPartAt(cssText.indexOf('.b') + 1)!

		expect(cssService.getContextualDefMatchParts(fromPart).map(part => part.escapedText)).toEqual(['.a'])
	})

	it('excludes the source HTML part from contextual match parts', () => {
		const htmlText = `<div id="root" class="a b"></div>`
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const fromPart = htmlService.findPartAt(htmlText.indexOf('a b'))!

		expect(htmlService.getContextualDefMatchParts(fromPart).map(part => [part.type, part.escapedText])).toEqual([
			[PartType.CSSSelectorTag, 'div'],
			[PartType.CSSSelectorId, '#root'],
			[PartType.CSSSelectorClass, '.b'],
		])
	})

	it('excludes the source tag from its HTML contextual match parts', () => {
		const htmlText = `<div id="root" class="a b"></div>`
		const htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		const htmlService = new HTMLService(htmlDocument, configuration)
		const fromPart = htmlService.findPartAt(htmlText.indexOf('div'))!

		expect(htmlService.getContextualDefMatchParts(fromPart).map(part => [part.type, part.escapedText])).toEqual([
			[PartType.CSSSelectorId, '#root'],
			[PartType.CSSSelectorClass, '.a'],
			[PartType.CSSSelectorClass, '.b'],
		])
	})
})
