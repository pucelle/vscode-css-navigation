import * as assert from 'assert'
import {prepare, searchCompletion as sc} from './helper'


describe('Test Completion', () => {
	before(prepare)

	it('Should find completion for id selectors, include nesting combined', async () => {
		assert.deepStrictEqual(await sc('id1'), ['id1'])
	})

	it('Should find completion for class selectors, include nesting combined', async () => {
		assert.deepStrictEqual(await sc('class1'), ['class1', 'class1-sub', 'class1-sub-tail', 'class10'])
	})

	it('Should find completion for inner style class selectors', async () => {
		assert.deepStrictEqual(await sc('css-class-in'), ['css-class-in-style'])
	})
})

