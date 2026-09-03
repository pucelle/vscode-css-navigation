import {describe, expect, it} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {CSSService, HTMLService, PartConvertor} from '../server/src/languages'
import {CSSServiceMap} from '../server/src/languages/services/css-service-map'
import {HTMLServiceMap} from '../server/src/languages/services/html-service-map'
import {TrackingTest} from '../server/src/core/file-tracker/tracking-test'
import {buildRenameWorkspaceEdit, rename as renameSelector} from '../server/src/rename'


const configuration = {
	enableClassNameDefinitionDiagnostic: false,
	enableClassNameReferenceDiagnostic: false,
} as any


function applyChanges(document: TextDocument, edits: {range: {start: any, end: any}, newText: string}[]): string {
	let text = document.getText()
	let offsetEdits = edits.map(edit => ({
		start: document.offsetAt(edit.range.start),
		end: document.offsetAt(edit.range.end),
		newText: edit.newText,
	})).sort((a, b) => b.start - a.start)

	for (let edit of offsetEdits) {
		text = text.slice(0, edit.start) + edit.newText + text.slice(edit.end)
	}

	return text
}


describe('class and id rename', () => {
	it('renames every exact class occurrence without contextual narrowing', () => {
		let htmlText = `<div class="old other" id="old"></div>`
		let cssText = `.old {}\n.old.other {}\n#old {}`
		let jsText = `document.querySelector('.old')`
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		let cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		let jsDocument = TextDocument.create('file:///workspace/index.js', 'javascript', 1, jsText)
		let htmlService = new HTMLService(htmlDocument, configuration)
		let cssService = new CSSService(cssDocument, configuration)
		let jsService = new HTMLService(jsDocument, configuration)
		let fromPart = htmlService.findPartAt(htmlText.indexOf('old'))!
		let defMatchPart = PartConvertor.toDefinitionMode(fromPart)
		let cssMap = Object.create(CSSServiceMap.prototype) as CSSServiceMap
		let htmlMap = Object.create(HTMLServiceMap.prototype) as HTMLServiceMap
		let matches = [
			...cssMap.findRenameMatchesFromServices([cssService], defMatchPart, fromPart),
			...htmlMap.findRenameMatchesFromServices([htmlService, jsService], defMatchPart, fromPart),
		]

		let edit = buildRenameWorkspaceEdit(fromPart, 'renamed', matches)!

		expect(applyChanges(cssDocument, edit.changes![cssDocument.uri])).toBe(`.renamed {}\n.renamed.other {}\n#old {}`)
		expect(applyChanges(htmlDocument, edit.changes![htmlDocument.uri])).toBe(`<div class="renamed other" id="old"></div>`)
		expect(applyChanges(jsDocument, edit.changes![jsDocument.uri])).toBe(`document.querySelector('.renamed')`)
	})

	it('renames ids without changing same-named classes', () => {
		let htmlText = `<div id="old" class="old"></div>`
		let cssText = `#old {}\n.old {}`
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		let cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, cssText)
		let htmlService = new HTMLService(htmlDocument, configuration)
		let cssService = new CSSService(cssDocument, configuration)
		let fromPart = htmlService.findPartAt(htmlText.indexOf('old'))!
		let defMatchPart = PartConvertor.toDefinitionMode(fromPart)
		let cssMap = Object.create(CSSServiceMap.prototype) as CSSServiceMap
		let htmlMap = Object.create(HTMLServiceMap.prototype) as HTMLServiceMap
		let matches = [
			...cssMap.findRenameMatchesFromServices([cssService], defMatchPart, fromPart),
			...htmlMap.findRenameMatchesFromServices([htmlService], defMatchPart, fromPart),
		]

		let edit = buildRenameWorkspaceEdit(fromPart, 'renamed', matches)!

		expect(applyChanges(cssDocument, edit.changes![cssDocument.uri])).toBe(`#renamed {}\n.old {}`)
		expect(applyChanges(htmlDocument, edit.changes![htmlDocument.uri])).toBe(`<div id="renamed" class="old"></div>`)
	})

	it('renames a nested class selector and its expanded references', () => {
		let scssText = `.button, .link {\n\t&-old {}\n}`
		let htmlText = `<div class="button-old link-old"></div>`
		let scssDocument = TextDocument.create('file:///workspace/style.scss', 'scss', 1, scssText)
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		let scssService = new CSSService(scssDocument, configuration)
		let htmlService = new HTMLService(htmlDocument, configuration)
		let fromPart = scssService.findDetailedPartAt(scssText.indexOf('&-old') + 2)!
		let defMatchPart = PartConvertor.toDefinitionMode(fromPart)
		let cssMap = Object.create(CSSServiceMap.prototype) as CSSServiceMap
		let htmlMap = Object.create(HTMLServiceMap.prototype) as HTMLServiceMap
		let matches = [
			...cssMap.findRenameMatchesFromServices([scssService], defMatchPart, fromPart),
			...htmlMap.findRenameMatchesFromServices([htmlService], defMatchPart, fromPart),
		]

		let edit = buildRenameWorkspaceEdit(fromPart, '&-new', matches)!

		expect(applyChanges(scssDocument, edit.changes![scssDocument.uri])).toBe(`.button, .link {\n\t&-new {}\n}`)
		expect(applyChanges(htmlDocument, edit.changes![htmlDocument.uri])).toBe(`<div class="button-new link-new"></div>`)
		expect(() => buildRenameWorkspaceEdit(fromPart, 'new', matches)).toThrow('must start with "&"')
	})

	it('renames a nested id selector and its expanded reference', () => {
		let scssText = `#item {\n\t&-old {}\n}`
		let htmlText = `<div id="item-old"></div>`
		let scssDocument = TextDocument.create('file:///workspace/style.scss', 'scss', 1, scssText)
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, htmlText)
		let scssService = new CSSService(scssDocument, configuration)
		let htmlService = new HTMLService(htmlDocument, configuration)
		let fromPart = scssService.findDetailedPartAt(scssText.indexOf('&-old') + 2)!
		let defMatchPart = PartConvertor.toDefinitionMode(fromPart)
		let cssMap = Object.create(CSSServiceMap.prototype) as CSSServiceMap
		let htmlMap = Object.create(HTMLServiceMap.prototype) as HTMLServiceMap
		let matches = [
			...cssMap.findRenameMatchesFromServices([scssService], defMatchPart, fromPart),
			...htmlMap.findRenameMatchesFromServices([htmlService], defMatchPart, fromPart),
		]

		let edit = buildRenameWorkspaceEdit(fromPart, '&-new', matches)!

		expect(applyChanges(scssDocument, edit.changes![scssDocument.uri])).toBe(`#item {\n\t&-new {}\n}`)
		expect(applyChanges(htmlDocument, edit.changes![htmlDocument.uri])).toBe(`<div id="item-new"></div>`)
	})

	it('keeps explicit excludes authoritative over always-include patterns', () => {
		let test = new TrackingTest({
			includeFileGlobPattern: '**/*.css',
			excludeGlobPattern: '**/node_modules/**',
			alwaysIncludeGlobSharer: {match: () => true} as any,
		})
		let dependencyPath = 'D:/workspace/node_modules/package/style.css'

		expect(test.shouldExcludePath(dependencyPath)).toBe(false)
		expect(test.matchesExcludePath(dependencyPath)).toBe(true)
	})

	it('omits excluded tracked files from the workspace edit', async () => {
		let config = {
			...configuration,
			activeHTMLFileExtensions: ['html'],
			activeCSSFileExtensions: ['css'],
			ignoreSameNameCSSFile: false,
			enableGlobalEmbeddedCSS: false,
		} as any
		let options = {
			includeFileGlobPattern: '**/*.{html,css}',
			excludeGlobPattern: '**/node_modules/**',
			alwaysIncludeGlobSharer: {match: () => true} as any,
		}
		let documents = {all: () => []} as any
		let cssMap = new CSSServiceMap(documents, {} as any, options, config)
		let htmlMap = new HTMLServiceMap(documents, {} as any, options, config)
		htmlMap.bindCSSServiceMap(cssMap)

		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, `<div class="old"></div>`)
		let cssDocument = TextDocument.create('file:///workspace/style.css', 'css', 1, `.old {}`)
		let dependencyDocument = TextDocument.create('file:///workspace/node_modules/package/style.css', 'css', 1, `.old {}`)
		htmlMap.trackOpenedDocument(htmlDocument)
		cssMap.trackOpenedDocument(cssDocument)
		cssMap.trackOpenedDocument(dependencyDocument)

		let edit = await renameSelector(htmlDocument, htmlDocument.getText().indexOf('old'), 'new', htmlMap, cssMap, config)

		expect(Object.keys(edit!.changes!)).toEqual([cssDocument.uri, htmlDocument.uri])
		expect(edit!.changes![dependencyDocument.uri]).toBeUndefined()
	})
})
