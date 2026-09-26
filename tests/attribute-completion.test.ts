import {describe, expect, it} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {getCompletionItems} from '../server/src/completion'
import {CSSService, HTMLService} from '../server/src/languages'


describe('attribute selector completion', () => {
	it('replaces auto-closed brackets when completing an empty attribute selector', async () => {
		let source = '[] {}'
		let document = TextDocument.create('file:///workspace/style.css', 'css', 1, source)
		let configuration = {activeHTMLFileExtensions: [], activeCSSFileExtensions: ['css'], enableCustomTagCompletion: true} as any
		let service = new CSSService(document, configuration)
		let htmlDocument = TextDocument.create('file:///workspace/index.html', 'html', 1, '<div aria-hidden="true"></div>')
		let htmlService = new HTMLService(htmlDocument, configuration)
		let items = await getCompletionItems(document, 1, {
			getReferencedCompletionLabels: async (part: any) => htmlService.getReferencedCompletionLabels(part),
		} as any, {
			forceGetServiceByDocument: async () => service,
		} as any, configuration)

		expect(items).toHaveLength(1)
		expect(items![0].label).toBe('[aria-hidden=true]')
		let edit = items![0].textEdit as {range: any, newText: string}
		let result = source.slice(0, document.offsetAt(edit.range.start)) + edit.newText
			+ source.slice(document.offsetAt(edit.range.end))

		expect(result).toBe('[aria-hidden=true] {}')
	})
})
