import {describe, expect, it, vi} from 'vitest'
import {ClassNamesInJS, JSTokenTree, PartType} from '../../server/src/languages'
import {JSTokenScanner} from '../../server/src/languages/scanners/js'


describe('ClassNamesInJS', () => {
	it.each([
		`class Table { subsectionClassName: string = 'd2-item-bases-drop' }`,
		`class Table { subsectionClassName = 'd2-item-bases-drop' }`,
		`class Table {\nprivate readonly subsectionClassName: string = 'd2-item-bases-drop'\n}`,
	])('discovers class names in a field initializer: %s', source => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		let parts = [...JSTokenTree.fromString(source, 0, 'ts').walkParts()]
			.filter(part => part.type === PartType.Class)

		expect(parts.map(part => part.escapedText)).toEqual(['d2-item-bases-drop'])
		expect(parts[0].start).toBe(source.indexOf('d2-item-bases-drop'))
	})

	it('keeps typed variable declarations and object-property initializers working', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		let source = `let buttonClassName: string = 'button'; let options = {itemClassName: 'item'}`
		let parts = [...ClassNamesInJS.walkParts(source)]

		expect(parts.map(part => part.escapedText)).toEqual(['button', 'item'])
	})

	it('does not treat function arguments in a class-name initializer as classes', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		let source = `let className = tables.getMay('classes', classId)
		const nextClassName = 'actual'`
		let parts = [...ClassNamesInJS.walkParts(source)]

		expect(parts.map(part => part.escapedText)).toEqual(['actual'])
	})

	it('still recognizes class literals outside calls in a grouped initializer', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		let source = `let className = (condition ? 'active' : lookup('key'))`
		let parts = [...ClassNamesInJS.walkParts(source)]

		expect(parts.map(part => part.escapedText)).toEqual(['active'])
	})

	it.each([
		`0; // const itemClassName = 'wrong'\n`,
		`0; /* const itemClassName = 'wrong' */`,
		`"const itemClassName = 'wrong'"`,
		`'object.itemClassName = "wrong"'`,
		'`{itemClassName: "wrong"}`',
		String.raw`"escaped \" const itemClassName = 'wrong'"`,
	])('ignores assignment triggers inside %s', literal => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const text = ${literal}; const itemClassName = 'right'`
		expect([...ClassNamesInJS.walkParts(source, 100)].map(part => part.escapedText)).toEqual(['right'])
		expect([...JSTokenTree.fromString(source, 100, 'js').walkParts()]
			.filter(part => part.type === PartType.Class).map(part => part.escapedText)).toEqual(['right'])
	})

	it('reuses Script token locations without rescanning JavaScript', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const tree = JSTokenTree.fromString(`const text = "const className = 'wrong'"; const className = 'right'`)
		const scan = vi.spyOn(JSTokenScanner.prototype, 'parseToTokens')
		try {
			expect([...tree.walkParts()].filter(part => part.type === PartType.Class).map(part => part.escapedText)).toEqual(['right'])
			expect(scan).not.toHaveBeenCalled()
		}
		finally {
			scan.mockRestore()
		}
	})

	it('allows real assignments in template interpolations', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = '`const className = "wrong" ${(() => { const className = "right"; return className })()}`'
		expect([...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)).toEqual(['right'])
	})

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

	it('preserves multiline branches while ignoring nested call arguments', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const className = condition // 'ignored'
		? combine('enabled', /* , ; } 'ignored' */ 'extra')
		: ['disabled', 'base']
		.join(' ')
		const unrelated = 'outside'`
		expect([...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)).toEqual(['disabled', 'base'])
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

	it('does not loop forever on a division inside an object initializer', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = `const boxClassName = {wide: width / 2 > 100, tall: true}\nconst nextClassName = 'after'`
		const classes = [...ClassNamesInJS.walkParts(source)].map(part => part.escapedText)

		expect(classes).toEqual(['wide', 'tall', 'after'])
	})

	it('does not loop forever on a JSX closing tag after a line-leading className attribute', () => {
		ClassNamesInJS.initWildNames(['*ClassName*'])
		const source = [
			`export function Card({item}) {`,
			`	return (`,
			`		<div`,
			`			className="card"`,
			`		>`,
			`			<h5 title={item.name}>{item.name}</h5>`,
			`			<p className="text">{item.text}</p>`,
			`		</div>`,
			`	)`,
			`}`,
		].join('\n')
		const classes = [...JSTokenTree.fromString(source, 0, 'tsx').walkParts()]
			.filter(part => part.type === PartType.Class)
			.map(part => part.escapedText)

		expect(classes).toEqual(['card', 'text'])
	})
})
