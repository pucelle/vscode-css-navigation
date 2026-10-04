import {describe, expect, it, vi} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {getCSSVariableColors} from '../server/src/css-variable-color'
import {CSSService, HTMLService} from '../server/src/languages'


const Configuration = {
	activeHTMLFileExtensions: ['html'],
	activeCSSFileExtensions: ['css'],
} as any
const Red = {red: 239 / 255, green: 68 / 255, blue: 68 / 255, alpha: 1}


/** Use real parsers while controlling the workspace's available variable definitions. */
function prepare(source: string, workspaceSources: string[] = [], languageId = 'css') {
	let document = TextDocument.create(`file:///workspace/index.${languageId}`, languageId, 1, source)
	let service = languageId === 'css'
		? new CSSService(document, Configuration)
		: new HTMLService(document, Configuration)
	let workspaceServices = workspaceSources.map((text, index) => {
		let document = TextDocument.create(`file:///workspace/palette-${index}.css`, 'css', 1, text)
		return new CSSService(document, Configuration)
	})
	let getCSSVariables = vi.fn(async (names: Set<string>) => {
		let values = new Map<string, string>()
		for (let workspaceService of workspaceServices) {
			for (let [name, value] of workspaceService.getCSSVariables(names)) {
				values.set(name, value)
			}
		}
		return values
	})
	let serviceMap = {forceGetServiceByDocument: async () => service, getCSSVariables} as any

	return {
		document,
		getCSSVariables,
		colors: () => getCSSVariableColors(document, serviceMap, serviceMap, Configuration),
	}
}


describe('CSS variable color previews', () => {
	it('previews both the direct reference and the alias from the reported example', async () => {
		let source = `:root { --co-red: #ef4444; --co-page: var(--co-red); }
		.co-rd { color: var(--co-page); }`
		let {document, colors, getCSSVariables} = prepare(source)
		let result = await colors()

		expect(result?.map(item => ({text: document.getText(item.range), color: item.color}))).toEqual([
			{text: '--co-red', color: Red},
			{text: '--co-page', color: Red},
		])
		expect(getCSSVariables).not.toHaveBeenCalled()
	})

	it('resolves multiple alias levels and repeated references', async () => {
		let source = `:root { --red: #ef4444; --page: var( --red ); --theme: var(--page); }
		.a { color: var(--theme); background: var(--theme); }`
		let {colors} = prepare(source)

		expect((await colors())?.map(item => item.color)).toEqual([Red, Red, Red, Red])
	})

	it('loads alias dependencies from other files even when they are not referenced in this document', async () => {
		let source = `.a { color: var(--theme); }`
		let {document, colors, getCSSVariables} = prepare(source, [
			`:root { --theme: var(--page); }`,
			`:root { --page: var(--red); --red: #ef4444; }`,
		])
		let result = await colors()

		expect(result).toHaveLength(1)
		expect(result![0].color).toEqual(Red)
		expect(document.getText(result![0].range)).toBe('--theme')
		expect(getCSSVariables.mock.calls.map(([names]) => [...names])).toEqual([
			['--theme'], ['--page'], ['--red'],
		])
	})

	it('preserves local values while loading missing workspace variables', async () => {
		let source = `:root { --red: #ef4444; --page: var(--red); }
		.a { color: var(--page); background: var(--external); }`
		let {colors} = prepare(source, [
			`:root { --red: blue; --external: var(--red); }`,
		])

		expect((await colors())?.map(item => item.color)).toEqual([Red, Red, Red])
	})

	it('finishes without previews for cycles, missing definitions and non-color aliases', async () => {
		let source = `:root {
			--a: var(--b); --b: var(--a); --self: var(--self);
			--missing: var(--undefined); --spacing: 12px; --padding: var(--spacing);
		}
		.a { color: var(--a); background: var(--self); border-color: var(--missing); padding: var(--padding); }`
		let {colors, getCSSVariables} = prepare(source)

		expect(await colors()).toEqual([])
		expect(getCSSVariables).toHaveBeenCalledTimes(1)
		expect([...getCSSVariables.mock.calls[0][0]]).toEqual(['--undefined'])
	})

	it('resolves aliases in HTML embedded styles', async () => {
		let source = `<style>:root { --red: #ef4444; --page: var(--red); }
		.a { color: var(--page); }</style>`
		let {colors} = prepare(source, [], 'html')

		expect((await colors())?.map(item => item.color)).toEqual([Red, Red])
	})
})
