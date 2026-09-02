import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {TextDocument} from '../server/node_modules/vscode-languageserver-textdocument'
import {getCompletionItems} from '../server/src/completion'
import {findDefinitions} from '../server/src/definition'
import {CSSService, HTMLService} from '../server/src/languages'
import {URI} from '../server/node_modules/vscode-uri'


const fixtureRoot = path.resolve(__dirname, '../client/test/fixture')
const jsxPath = path.join(fixtureRoot, 'css-module-service.jsx')
const cssPath = path.join(fixtureRoot, 'css/test.scss')
const jsxURI = URI.file(jsxPath).toString()
const cssURI = URI.file(cssPath).toString()
const configuration = {
	activeHTMLFileExtensions: ['jsx'],
	activeCSSFileExtensions: ['css', 'scss', 'sass', 'less'],
	maxHoverStylePropertyCount: 4,
	enableClassNameDefinitionDiagnostic: false,
	enableClassNameReferenceDiagnostic: false,
	enableCustomTagCompletion: true,
	ignoreCustomAndComponentTagDefinition: true,
	enableGlobalEmbeddedCSS: false,
} as any


function prepareServices(source: string) {
	const document = TextDocument.create(jsxURI, 'javascriptreact', 1, source)
	const cssDocument = TextDocument.create(cssURI, 'scss', 1, fs.readFileSync(cssPath, 'utf8'))
	const htmlService = new HTMLService(document, configuration)
	const cssService = new CSSService(cssDocument, configuration)
	const htmlServiceMap = {
		forceGetServiceByDocument: async () => htmlService,
	} as any
	const cssServiceMap = {
		forceGetServiceByURI: async (uri: string) => uri === cssURI ? cssService : undefined,
	} as any

	return {document, htmlServiceMap, cssServiceMap}
}


describe('CSS Module language service', () => {
	it('finds a module-scoped definition outside JSX attributes', async () => {
		const source = `import styles from './css/test.scss'\nconst className = styles.cssModuleClass`
		const {document, htmlServiceMap, cssServiceMap} = prepareServices(source)
		const offset = source.indexOf('cssModuleClass') + 3

		const locations = await findDefinitions(document, offset, htmlServiceMap, cssServiceMap, configuration)
		expect(locations).toHaveLength(1)
		expect(locations![0].uri).toBe(cssURI)
		const cssText = fs.readFileSync(cssPath, 'utf8')
		const cssDocument = TextDocument.create(cssURI, 'scss', 1, cssText)
		expect(cssText.slice(
			cssDocument.offsetAt(locations![0].range.start),
			cssDocument.offsetAt(locations![0].range.end),
		)).toBe('.cssModuleClass {}')
	})

	it('returns completions only from the imported module', async () => {
		const source = `import styles from './css/test.scss'\nconst className = styles.cssModuleCom`
		const {document, htmlServiceMap, cssServiceMap} = prepareServices(source)
		const items = await getCompletionItems(document, source.length, htmlServiceMap, cssServiceMap, configuration)

		expect(items?.map(item => item.label)).toContain('cssModuleCompletion')
	})
})
