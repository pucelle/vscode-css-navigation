import * as assert from 'assert'
import {prepare, searchReferences, htmlDocument} from './helper'


describe('Test Reference from CSS', () => {
	before(prepare)

	// Note here all references limited in index.html

	it('Should find references for id selectors', async () => {
		assert.deepStrictEqual(await searchReferences('#id1'), ['id1'])
	})

	it('Should find references for class selectors even within nesting', async () => {
		assert.deepStrictEqual(await searchReferences('.class1'), ['class1'])
		assert.deepStrictEqual(await searchReferences('&-sub'), ['class1-sub'])
		assert.deepStrictEqual(await searchReferences('&-tail'), ['class1-sub-tail'])
	})

	it('Should find references for class selectors which are splitted by "@at-root" or "@media" command', async () => {
		assert.deepStrictEqual(await searchReferences('&-sub5'), ['class5-sub5'])
		assert.deepStrictEqual(await searchReferences('&-sub6'), ['class6-sub6'])
		assert.deepStrictEqual(await searchReferences('.class7-sub7'), ['class7-sub7'])
	})

	it('Should find reference in current HTML document, be aware this is not available by default', async () => {
		assert.ok((await searchReferences('.css-class-in-style', htmlDocument))!.includes('css-class-in-style'))
		assert.ok((await searchReferences('&-in-style', htmlDocument))!.includes('scss-class-in-style'))
	})

	it('Should find references of css variable', async () => {
		assert.deepStrictEqual(await searchReferences('--css-variable-color'), ['--css-variable-color'])
	})
})


describe('Test Reference in HTML', () => {
	before(prepare)

	// Note here all references limited in index.html

	it('Should find references for id selectors', async () => {
		assert.deepStrictEqual(await searchReferences('id1', htmlDocument), ['id1'])
	})

	it('Should find references for class selectors', async () => {
		assert.deepStrictEqual(await searchReferences('class1', htmlDocument), ['class1'])
	})
})