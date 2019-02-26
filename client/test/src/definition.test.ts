import * as assert from 'assert'
import {sleep, prepare, searchSymbolNames as gs} from './helper'


describe('Test CSS Definition', () => {
	before(prepare)

	it('Should find right tag definition', async () => {
		assert.deepEqual(await gs(['<', 'html', '>']), ['html'])
		assert.deepEqual(await gs(['<', 'body', '>']), ['body'])
		//assert.deepEqual(await gs(['<', 'custom-element', '>']), ['custom-element'])	//ignore custom element by default
	})

	it('Should find right id definition even whthin sass nesting', async () => {
		assert.deepEqual(await gs(['id="', 'id', '"']), ['#id'])
	})

	it('Should ignore css file when same name scss file exists', async () => {
		assert.deepEqual(await gs(['class="', 'class1', '"']), ['.class1'])
	})

	it('Should find right class definition even whthin sass nesting', async () => {
		assert.deepEqual(await gs(['class="', 'class1', '"']), ['.class1'])
		assert.deepEqual(await gs(['class="', 'class1-sub', '"']), ['&-sub'])
		assert.deepEqual(await gs(['class="', 'class1-sub-tail', '"']), ['&-tail'])
	})

	it('Should find right class definition whthin sass nesting and have multiple parent selectors', async () => {
		assert.deepEqual(await gs(['class="', 'class2-sub', '"']), ['&-sub'])
		assert.deepEqual(await gs(['class="', 'class3-sub', '"']), ['&-sub'])
	})

	it('Should merge and multiple all sass nestings, so one symbol may match multiple selectors', async () => {
		assert.deepEqual(await gs(['class="', 'class4', '"']), ['.class4, .class4-sub'])
		assert.deepEqual(await gs(['class="', 'class4-sub', '"']), ['.class4, .class4-sub', '&-sub'])
		assert.deepEqual(await gs(['class="', 'class4-sub-sub', '"']), ['&-sub'])
		assert.deepEqual(await gs(['class="', 'class4-sub-tail', '"']), ['&-tail'])
		assert.deepEqual(await gs(['class="', 'class4-sub-sub-tail', '"']), ['&-tail'])
	})

	it('Should find right class definition as start part', async () => {
		assert.deepEqual(await gs(['class="', 'class-match1', '"']), ['.class-match1:hover'])
		assert.deepEqual(await gs(['class="', 'class-match2', '"']), ['.class-match2::before'])
		assert.deepEqual(await gs(['class="', 'class-match3', '"']), ['.class-match3[name=value]'])
	})

	it('Should find right class definition as right most descendant part', async () => {
		assert.deepEqual(await gs(['class="', 'class-match4', '"']), ['.class-any .class-match4'])
		assert.deepEqual(await gs(['class="', 'class-match5', '"']), ['.class-any .class-match5:hover'])
		assert.deepEqual(await gs(['class="', 'class-match6', '"']), ['.class-any > .class-match6'])
		assert.deepEqual(await gs(['class="', 'class-match7', '"']), ['.class-any + .class-match7'])
		assert.deepEqual(await gs(['class="', 'class-match8', '"']), ['.class-any ~ .class-match8'])
	})

	it('Should not find definition when not been start of right most descendant part', async () => {
		assert.deepEqual(await gs(['class="', 'class-not-match1', '"']), [])
		assert.deepEqual(await gs(['class="', 'class-not-match2', '"']), [])
		assert.deepEqual(await gs(['class="', 'class-not-match3', '"']), [])
		assert.deepEqual(await gs(['class="', 'class-not-match4', '"']), [])
	})

	it('Should exclude symbols start with @', async () => {
		assert.deepEqual(await gs(['<', 'tag-not-match1', '>']), [])
	})

	it('Should find definition inside <style> tag', async () => {
		assert.deepEqual(await gs(['class="', 'css-class-in-style', '"']), ['.css-class-in-style'])
		assert.deepEqual(await gs(['class="', 'scss-class-in-style', '"']), ['&-in-style'])
	})
})
