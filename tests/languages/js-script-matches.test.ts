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
})
