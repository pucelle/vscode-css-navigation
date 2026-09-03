import {describe, expect, it} from 'vitest'
import {ClassNamesInJS, JSTokenTree, PartType} from '../../server/src/languages'


describe('ClassNamesInJS', () => {
	it('scans every class in a named variable expression', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])

		const source = `const ___ = useMemo(() => {
			const dictionnaryClassName = [
				'classA',
				connected ? 'connected' : 'disconnected',
				'classB',
			].join(' ');
			return dictionnaryClassName;
		}, [connected]);`

		const classes = [...JSTokenTree.fromString(source, 0, 'js').walkParts()]
			.filter(part => part.type === PartType.Class)
			.map(part => part.escapedText)

		expect(classes).toEqual(['classA', 'connected', 'disconnected', 'classB'])
	})

	it('does not scan strings after the variable initializer', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])

		const source = `const itemClassName = ['inside']; const unrelated = 'outside';`
		const classes = [...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)

		expect(classes).toEqual(['inside'])
	})

	it('uses the supplied source offset only for returned part positions', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const itemClassName = 'inside';`
		const [part] = [...ClassNamesInJS.walkParts(source, 100)]

		expect(part.escapedText).toBe('inside')
		expect(part.start).toBe(100 + source.indexOf('inside'))
	})

	it('does not scan the value of a following object property', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `{itemClassName: condition ? 'enabled' : 'disabled', unrelated: 'outside'}`
		const classes = [...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)

		expect(classes).toEqual(['enabled', 'disabled'])
	})
})
