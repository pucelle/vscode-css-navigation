import {describe, expect, it} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {getCodeActions} from '../server/src/code-action'
import {
	ClassNameDiagnosticCode,
	getDiagnostics,
	makeDiagnosticIgnoredClassNameMatcher,
} from '../server/src/diagnostic'
import {CSSService, HTMLService} from '../server/src/languages'


const baseConfiguration = {
	activeHTMLFileExtensions: ['html'],
	activeCSSFileExtensions: ['css'],
	enableClassNameDefinitionDiagnostic: false,
	enableClassNameReferenceDiagnostic: false,
	enableGlobalEmbeddedCSS: false,
	diagnosticIgnoredClassNames: [],
} as any


describe('diagnostic ignored class names', () => {
	it('supports exact names, a leading dot, and wildcards', () => {
		const isIgnored = makeDiagnosticIgnoredClassNameMatcher(['exact', '.with-dot', 'generated-*'])

		expect(isIgnored('exact')).toBe(true)
		expect(isIgnored('with-dot')).toBe(true)
		expect(isIgnored('generated-button')).toBe(true)
		expect(isIgnored('generated')).toBe(false)
		expect(isIgnored('inexact')).toBe(false)
	})

	it('suppresses matching missing-definition diagnostics', async () => {
		const source = `<div class="external generated-button missing"></div>`
		const document = TextDocument.create('file:///workspace/index.html', 'html', 1, source)
		const configuration = {
			...baseConfiguration,
			enableClassNameDefinitionDiagnostic: true,
			diagnosticIgnoredClassNames: ['external', 'generated-*'],
		}
		const htmlService = new HTMLService(document, configuration)
		const diagnostics = await getDiagnostics(
			document,
			{
				forceGetServiceByDocument: async () => htmlService,
				beFresh: async () => undefined,
				hasDefinedClassName: () => false,
			} as any,
			{
				beFresh: async () => undefined,
				hasDefinedClassName: () => false,
			} as any,
			configuration,
		)

		expect(diagnostics).toHaveLength(1)
		expect(diagnostics![0].code).toBe(ClassNameDiagnosticCode.DefinitionNotFound)
		expect(diagnostics![0].data).toEqual({className: 'missing'})
	})

	it('suppresses matching missing-reference diagnostics', async () => {
		const source = `.external {}\n.generated-button {}\n.missing {}`
		const document = TextDocument.create('file:///workspace/style.css', 'css', 1, source)
		const configuration = {
			...baseConfiguration,
			enableClassNameReferenceDiagnostic: true,
			diagnosticIgnoredClassNames: ['external', 'generated-*'],
		}
		const cssService = new CSSService(document, configuration)
		const diagnostics = await getDiagnostics(
			document,
			{
				beFresh: async () => undefined,
				hasReferencedClassName: () => false,
			} as any,
			{
				forceGetServiceByDocument: async () => cssService,
			} as any,
			configuration,
		)

		expect(diagnostics).toHaveLength(1)
		expect(diagnostics![0].code).toBe(ClassNameDiagnosticCode.ReferenceNotFound)
		expect(diagnostics![0].data).toEqual({className: 'missing'})
	})

	it('offers workspace and user quick fixes for its diagnostics', () => {
		const diagnostic = {
			range: {start: {line: 0, character: 0}, end: {line: 0, character: 7}},
			message: `Can't find definition for ".missing".`,
			source: 'CSS Navigation',
			code: ClassNameDiagnosticCode.DefinitionNotFound,
			data: {className: 'missing'},
		}
		const actions = getCodeActions({
			textDocument: {uri: 'file:///workspace/index.html'},
			range: diagnostic.range,
			context: {diagnostics: [diagnostic]},
		})

		expect(actions.map(action => action.title)).toEqual([
			'Ignore "missing" in Workspace Settings',
			'Ignore "missing" in User Settings',
		])
		expect(actions.map(action => action.command?.arguments?.[0])).toEqual([
			{className: 'missing', target: 'workspace', uri: 'file:///workspace/index.html'},
			{className: 'missing', target: 'user', uri: 'file:///workspace/index.html'},
		])
	})
})
