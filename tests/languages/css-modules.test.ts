import {describe, expect, it} from 'vitest'
import {findCSSModuleImportPath, findCSSModuleImports, walkCSSModuleParts} from '../../server/src/languages/css-modules'
import {PartType} from '../../server/src/languages/parts'


function moduleProperties(text: string) {
	return [...walkCSSModuleParts(text)]
		.filter(part => part.type === PartType.ImportedCSSModuleProperty)
		.map(part => ({text: part.rawText, start: part.start}))
}


describe('CSS Modules', () => {
	it('finds default, namespace, and CommonJS imports', () => {
		const text = [
			`import styles from './default.module.css'`,
			`import * as theme from './theme.scss'`,
			`const legacy = require('./legacy.less')`,
		].join('\n')

		expect(findCSSModuleImports(text).map(item => [item.name, item.path])).toEqual([
			['styles', './default.module.css'],
			['theme', './theme.scss'],
			['legacy', './legacy.less'],
		])
		expect(findCSSModuleImportPath(text, 'theme')).toBe('./theme.scss')
	})

	it('recognizes module properties anywhere in script code', () => {
		const text = [
			`import styles from './button.module.css'`,
			`const first = styles.primary`,
			`const second = styles['primary-large']`,
			`const unrelated = console.log`,
		].join('\n')

		expect(moduleProperties(text).map(part => part.text)).toEqual(['primary', 'primary-large'])
	})

	it('creates zero-width and partial properties for completion', () => {
		const dotText = `import styles from './button.css'; styles.`
		const bracketText = `import styles from './button.css'; styles['primary`

		expect(moduleProperties(dotText)).toEqual([{text: '', start: dotText.length}])
		expect(moduleProperties(bracketText)).toEqual([{
			text: 'primary',
			start: bracketText.lastIndexOf('primary'),
		}])
	})

	it('ignores member access when the binding is not a CSS import', () => {
		const text = `import data from './data.json'; data.primary`
		expect(moduleProperties(text)).toEqual([])
	})
})
