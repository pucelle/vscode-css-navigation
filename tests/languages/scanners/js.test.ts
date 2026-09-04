import {describe, expect, it} from 'vitest'
import {JSTokenScanner, JSTokenType, isWithinJSNonCode} from '../../../server/src/languages/scanners/js'

describe('JSTokenScanner string locations', () => {
	it('records comments including those inside nested template expressions', () => {
		const source = '// first\r\n`text ${call(/* nested */ `inner ${value // deep\n}`)}` /* last */'
		const [token] = [...new JSTokenScanner(source, 70, 'js').parseToTokens()]
		expect(token.commentLocations?.map(location => source.slice(location.start - 70, location.end - 70)))
			.toEqual(['// first', '/* nested */', '// deep', '/* last */'])
	})

	it.each(['// unfinished', '/* unfinished'])('records EOF comments: %s', source => {
		const [token] = [...new JSTokenScanner(source, 10, 'js').parseToTokens()]
		expect(token.commentLocations).toEqual([{start: 10, end: 10 + source.length}])
	})

	it('does not leak embedded-template comments into the next Script token', () => {
		const source = '/* before */ html`<div>${value /* embedded */}</div>` /* after */'
		const scripts = [...new JSTokenScanner(source, 0, 'js').parseToTokens()].filter(token => token.type === JSTokenType.Script)
		expect(scripts.map(token => token.commentLocations?.map(range => source.slice(range.start, range.end))))
			.toEqual([['/* before */'], ['/* after */']])
	})

	it('binary searches range boundaries and requires full containment', () => {
		const ranges = Array.from({length: 100}, (_, i) => ({start: i * 10, end: i * 10 + 5}))
		for (let index of [0, 49, 99]) {
			const start = index * 10
			expect(isWithinJSNonCode(start, start + 5, ranges)).toBe(true)
			expect(isWithinJSNonCode(start, start + 6, ranges)).toBe(false)
			expect(isWithinJSNonCode(start + 5, start + 6, ranges)).toBe(false)
			expect(isWithinJSNonCode(start, start + 5, [], ranges)).toBe(true)
		}
		expect(isWithinJSNonCode(1, 2)).toBe(false)
	})

	it('records quoted strings with absolute, end-exclusive offsets', () => {
		const source = `const text = "const itemClassName = 'wrong'"; const className = 'right'`
		const [token] = [...new JSTokenScanner(source, 100, 'js').parseToTokens()]
		expect(token.stringLocations).toEqual([
			{start: 100 + source.indexOf('"'), end: 100 + source.lastIndexOf('"') + 1},
			{start: 100 + source.indexOf("'right'"), end: 100 + source.length},
		])
	})

	it('keeps template expressions outside template text locations', () => {
		const source = '`before ${call("inside", `nested ${value}`)} after`'
		const [token] = [...new JSTokenScanner(source, 0, 'js').parseToTokens()]
		expect(token.stringLocations?.map(location => source.slice(location.start, location.end))).toEqual([
			'`before ${', '"inside"', '`nested ${', '}`', '} after`',
		])
	})

	it('resets locations between Script tokens separated by embedded templates', () => {
		const source = "'first'; html`<div class=\"html\"></div>`; 'second'; css`.css { color: red }`; 'third'"
		const tokens = [...new JSTokenScanner(source, 50, 'js').parseToTokens()]
		expect(tokens.filter(token => token.type === JSTokenType.Script).map(token =>
			token.stringLocations?.map(location => source.slice(location.start - 50, location.end - 50))
		)).toEqual([["'first'"], ["'second'"], ["'third'"]])
	})

	it('records an unterminated string through EOF', () => {
		const source = `const text = "const className = 'wrong'`
		const [token] = [...new JSTokenScanner(source, 0, 'js').parseToTokens()]
		expect(token.stringLocations).toEqual([{start: source.indexOf('"'), end: source.length}])
	})
})
