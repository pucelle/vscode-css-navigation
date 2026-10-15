import {describe, expect, it} from 'vitest'
import {ClassNamesInJS, JSTokenTree, PartType} from '../../server/src/languages'

describe('JSTokenTree script match locations', () => {
	const examples = [
		["document.querySelector('.target')", PartType.CSSSelectorQueryClass],
		["document.querySelectorAll('.target')", PartType.CSSSelectorQueryClass],
		["$('.target')", PartType.CSSSelectorQueryClass],
		["element.classList.add('target')", PartType.Class],
		["const itemClassName = 'target'", PartType.Class],
		["element.style.setProperty('--target', 'red')", PartType.CSSVariableAssignment],
		["import 'target.css'", PartType.CSSImportPath],
	] as const

	it.each(examples)('rejects %s inside strings/comments but keeps actual code', (code, type) => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const text = "${code}";\n// ${code}\n/* ${code} */\n${code};`
		const parts = [...JSTokenTree.fromString(source, 100, 'js').walkParts()].filter(part => part.type === type)
		expect(parts).toHaveLength(1)
		expect(parts[0].start).toBeGreaterThanOrEqual(100 + source.lastIndexOf(code))
	})

	it('filters comments and template text but keeps executable interpolation code', () => {
		const source = '`document.querySelector(".fake") ${(() => { /* document.querySelector(".comment") */ return document.querySelector(".real") })()}`'
		const parts = [...JSTokenTree.fromString(source).walkParts()].filter(part => part.type === PartType.CSSSelectorQueryClass)
		expect(parts.map(part => part.escapedText)).toEqual(['.real'])
	})

	it('finds every literal argument passed to classList.add', () => {
		let source = `this.el.classList.add('items-table', "items-table-unique", \`items-table-last\`)`
		let parts = [...JSTokenTree.fromString(source).walkParts()].filter(part => part.type === PartType.Class)

		expect(parts.map(part => part.escapedText)).toEqual([
			'items-table',
			'items-table-unique',
			'items-table-last',
		])
		expect(parts.map(part => source.slice(part.start, part.end))).toEqual([
			'items-table',
			'items-table-unique',
			'items-table-last',
		])
	})

	it('does not read past non-literal classList.add arguments', () => {
		let source = `element.classList.add('first', dynamic, 'not-direct'); element.classList.add('second')`
		let parts = [...JSTokenTree.fromString(source).walkParts()].filter(part => part.type === PartType.Class)

		expect(parts.map(part => part.escapedText)).toEqual(['first', 'second'])
	})

	it.each([
		`document.documentElement.classList.add('theme-' + theme)`,
		`element.classList.add("theme-" + theme)`,
		'element.classList.add(`theme-` + theme)',
		`element.classList.add('theme-' /* comment */ + theme)`,
		`element.classList.add('theme-' // comment\n + theme)`,
		`element.classList.add('theme-' === theme)`,
		`element.classList.add(theme + 'theme-')`,
	])('ignores incomplete classList.add string arguments: %s', source => {
		let parts = [...JSTokenTree.fromString(source).walkParts()]
			.filter(part => part.type === PartType.Class)

		expect(parts).toEqual([])
	})

	it('keeps complete arguments before an expression and detects later calls', () => {
		let source = `element.classList.add('base', 'theme-' + theme, 'after'); element.classList.add('other')`
		let parts = [...JSTokenTree.fromString(source, 100).walkParts()]
			.filter(part => part.type === PartType.Class)

		expect(parts.map(part => part.escapedText)).toEqual(['base', 'other'])
		expect(parts.map(part => source.slice(part.start - 100, part.end - 100))).toEqual(['base', 'other'])
	})

	it('accepts a complete literal followed by comments before the closing parenthesis', () => {
		let source = `element.classList.add('base' /* comment */ // comment\n)`
		let parts = [...JSTokenTree.fromString(source).walkParts()]
			.filter(part => part.type === PartType.Class)

		expect(parts.map(part => part.escapedText)).toEqual(['base'])
	})
})
