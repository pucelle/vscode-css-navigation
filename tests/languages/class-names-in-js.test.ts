import {describe, expect, it} from 'vitest'
import {ClassNamesInJS, JSTokenTree, PartType} from '../../server/src/languages'


describe('ClassNamesInJS', () => {
	it('does not scan the following if condition without a semicolon', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `let className = decl.parent.name && transformContext.helper.getText(decl.parent.name)
		if (className !== 'Array' && className !== 'ReadonlyArray') {
			return null
		}`
		expect([...ClassNamesInJS.walkParts(source)]).toEqual([])
	})

	it.each(['\n', '\r\n', ' /* comment\n "ignored" */ '])('stops at statement boundaries with %j', separator => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const className = 'inside'${separator}const unrelated = 'outside'
		const nextClassName = 'next'`
		expect([...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)).toEqual(['inside', 'next'])
	})

	it('preserves multiline continuations and nested call commas', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const className = condition // 'ignored'
		? combine('enabled', /* , ; } 'ignored' */ 'extra')
		: ['disabled', 'base']
		.join(' ')
		const unrelated = 'outside'`
		expect([...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)).toEqual(['enabled', 'extra', 'disabled', 'base'])
	})

	it('preserves operators before line breaks and skips trailing comments', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const className = condition && // 'ignored'
		'enabled' /* 'ignored' */
		if (name === 'outside') {}`
		expect([...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)).toEqual(['enabled'])
	})

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

	it('advances past an assignment located late in the source', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `${'const unrelated = 1;\n'.repeat(20)}const itemClassName = 'inside';`
		const classes = [...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)

		expect(classes).toEqual(['inside'])
	})
})
