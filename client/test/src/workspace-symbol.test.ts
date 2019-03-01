import * as assert from 'assert'
import {prepare, searchWorkspaceSymbolNames as gws} from './helper'


describe('Test Workspace Symbol', () => {
	before(prepare)

	it('Should find any symbol when query starts with it', async () => {
		assert.ok((await gws('class')).length > 0)
	})

	it('Should find any symbol when left word boundary match in the middle', async () => {
		assert.ok((await gws('sub')).length > 0)
	})

	it('Should not find any symbol when left word boundary not match', async () => {
		assert.ok((await gws('lass')).length === 0)
	})

	it('Should find any symbol when query doesn\'t start with a not [a-z] character and left word boundary match', async () => {
		assert.ok((await gws('-sub')).length > 0)
	})

	it('Should fix nested symbol names which starts with "&"', async () => {
		assert.deepEqual(await gws('.class1-sub'), ['.class1-sub', '.class1-sub-tail'])
		assert.deepEqual(await gws('.class1-sub-tail'), ['.class1-sub-tail'])
		assert.deepEqual(await gws('.class4-sub'), ['.class4-sub', '.class4-sub', '.class4-sub-sub', '.class4-sub-tail', '.class4-sub-sub-tail'])
	})

	it('Should find commands start with "@"', async () => {
		assert.ok((await gws('@keyframes tag-not-match')).length > 0)
	})

	it('Should combine selectors with spaces after eliminating sass nesting', async () => {
		assert.deepEqual(await gws('tagnotmatch'), ['body tagnotmatch', 'body tagnotmatch'])
	})

	it('Should not combine with parent selectors when inside @at-root', async () => {
		assert.deepEqual(await gws('.class6-child'), ['.class6-child'])
	})
})

