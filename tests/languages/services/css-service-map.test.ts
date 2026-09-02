import {describe, expect, it} from 'vitest'
import {TextDocument} from '../../../server/node_modules/vscode-languageserver-textdocument'
import {CSSServiceMap, shouldIgnoreSameNameCSSURI} from '../../../server/src/languages/services/css-service-map'


class TestCSSServiceMap extends CSSServiceMap {
	async getAvailableURIs() {
		await this.beFresh()
		return [...this.walkAvailableServices()].map(service => service.document.uri)
	}
}


function makeServiceMap(ignoreSameNameCSSFile: boolean) {
	return new TestCSSServiceMap(
		{all: () => []} as any,
		{} as any,
		{includeFileGlobPattern: '**/*.{css,scss,sass,less}'},
		{ignoreSameNameCSSFile, enableClassNameDefinitionDiagnostic: false} as any,
	)
}


describe('shouldIgnoreSameNameCSSURI', () => {
	it.each(['scss', 'sass', 'less'])('ignores CSS when a same-name %s source is active', extension => {
		const cssURI = 'file:///workspace/styles/button.css'
		const activeURIs = new Set([cssURI, `file:///workspace/styles/button.${extension}`])

		expect(shouldIgnoreSameNameCSSURI(cssURI, activeURIs)).toBe(true)
	})

	it('does not ignore CSS when the source has a different basename or directory', () => {
		const cssURI = 'file:///workspace/styles/button.css'
		const activeURIs = new Set([
			cssURI,
			'file:///workspace/styles/other.scss',
			'file:///workspace/other/button.less',
		])

		expect(shouldIgnoreSameNameCSSURI(cssURI, activeURIs)).toBe(false)
	})

	it('never treats a preprocessor source as generated CSS', () => {
		const scssURI = 'file:///workspace/styles/button.scss'
		const activeURIs = new Set([scssURI, 'file:///workspace/styles/button.css'])

		expect(shouldIgnoreSameNameCSSURI(scssURI, activeURIs)).toBe(false)
	})

	it('filters the CSS service and restores it when the source becomes inactive', async () => {
		const serviceMap = makeServiceMap(true)
		const cssDocument = TextDocument.create('file:///workspace/button.css', 'css', 1, '.from-css {}')
		const scssDocument = TextDocument.create('file:///workspace/button.scss', 'scss', 1, '.from-scss {}')

		serviceMap.trackOpenedDocument(cssDocument)
		serviceMap.trackOpenedDocument(scssDocument)
		expect(await serviceMap.getAvailableURIs()).toEqual([scssDocument.uri])

		serviceMap.onDocumentClosed(scssDocument)
		expect(await serviceMap.getAvailableURIs()).toEqual([cssDocument.uri])
	})

	it('keeps both services when the option is disabled', async () => {
		const serviceMap = makeServiceMap(false)
		const cssDocument = TextDocument.create('file:///workspace/button.css', 'css', 1, '.from-css {}')
		const lessDocument = TextDocument.create('file:///workspace/button.less', 'less', 1, '.from-less {}')

		serviceMap.trackOpenedDocument(cssDocument)
		serviceMap.trackOpenedDocument(lessDocument)
		expect(await serviceMap.getAvailableURIs()).toEqual([cssDocument.uri, lessDocument.uri])
	})
})
