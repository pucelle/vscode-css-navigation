import * as assert from 'assert'
import {prepare, searchReferences, htmlDocument} from './helper'


describe('Test Reference', () => {
	before(prepare)

	it('Should not find reference for tag selectors', async () => {
		assert.ok((await searchReferences('html'))!.length === 0)
		assert.ok((await searchReferences('body'))!.length === 0)
	})

	it('Should find references for id selectors', async () => {
		assert.deepStrictEqual(await searchReferences('#id1'), ['<div id="id1">'])
	})

	it('Should find references for class selectors even within nesting', async () => {
		assert.deepStrictEqual(await searchReferences('.class1'), ['<div class="class1">'])
		assert.deepStrictEqual(await searchReferences('&-sub'), ['<div class="class1-sub">'])
		assert.deepStrictEqual(await searchReferences('&-tail'), ['<div class="class1-sub-tail">'])
	})

	it('Should find references for class selectors which are splited by "@at-root" or "@media" command', async () => {
		assert.deepStrictEqual(await searchReferences('&-sub5'), ['<div class="class5-sub5">'])
		assert.deepStrictEqual(await searchReferences('&-sub6'), ['<div class="class6-sub6">'])
		assert.deepStrictEqual(await searchReferences('.class7-sub7'), ['<div class="class7-sub7">'])
	})

	it('Should find reference in current HTML document, be aware this is not available by default', async () => {
		assert.ok(
			(await searchReferences('.css-class-in-style', htmlDocument))!.includes('<div class="css-class-in-style">')
		)
		assert.ok(
			(await searchReferences('&-in-style', htmlDocument))!.includes('<div class="scss-class-in-style">')
		)
	})
})

