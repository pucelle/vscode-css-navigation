import * as assert from 'assert'
import {prepare, searchSymbolNames as gs, jsxDocument, vueDocument} from './helper'


describe('Test Finding Definition from HTML', () => {
	before(prepare)

	it('Should ignore css file when same name scss file exists', async () => {
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})

	it('Should ignore custom element definition by default', async () => {
		assert.deepStrictEqual(await gs(['<', 'custom-element', '>']), [])	//ignore custom element by default
	})
	
	it('Should exclude commands start with "@"', async () => {
		assert.deepStrictEqual(await gs(['<', 'tag-not-match', '>']), [])
	})

	it('Should not parse `from` and `to` inside "@keyframes" as selectors', async () => {
		assert.deepStrictEqual(await gs(['<', 'from', '>']), [])
	})

	it('Should find right tag definition', async () => {
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})

	it('Should find right id definition', async () => {
		assert.deepStrictEqual(await gs(['id="', 'id1', '"']), ['#id1'])
	})

	it('Should find right class definition even within sass nesting', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class1', '"']), ['.class1'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub-tail', '"']), ['&-tail'])
	})

	it('Should find right class definition within sass nesting when have multiple parent selectors', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class2-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class3-sub', '"']), ['&-sub'])
	})

	it('Should combine multiple sass nestings, so one symbol may match multiple selectors', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class4', '"']), ['.class4, .class4-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class4-sub', '"']), ['.class4-sub', '&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class4-sub-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class4-sub-tail', '"']), ['&-tail'])
		assert.deepStrictEqual(await gs(['class="', 'class4-sub-sub-tail', '"']), ['&-tail'])
	})

	it('Should combine to eliminate "&" when parts splitted by commands', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class5-sub5', '"']), ['&-sub5'])
		assert.deepStrictEqual(await gs(['class="', 'class6-sub6', '"']), ['&-sub6'])
	})

	it('Should not combine with space when splitted by "@at-root"', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class7-sub7', '"']), ['.class7-sub7'])
	})

	it('Should find right class definition when it\'s start part', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class-match1', '"']), ['.class-match1:hover'])
		assert.deepStrictEqual(await gs(['class="', 'class-match2', '"']), [])
		assert.deepStrictEqual(await gs(['class="', 'class-match3', '"']), ['.class-match3[name=value]'])
	})

	it('Should find right class definition as right most descendant part', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class-match4', '"']), ['.class-match4'])
		assert.deepStrictEqual(await gs(['class="', 'class-match5', '"']), ['.class-match5:hover'])
		assert.deepStrictEqual(await gs(['class="', 'class-match6', '"']), ['.class-match6'])
		assert.deepStrictEqual(await gs(['class="', 'class-match7', '"']), ['.class-match7'])
		assert.deepStrictEqual(await gs(['class="', 'class-match8', '"']), ['.class-match8'])
		assert.deepStrictEqual(await gs(['class="', 'class-match9', '"']), ['.class-match9'])
		assert.deepStrictEqual(await gs(['class="', 'class-match10', '"']), ['.class-match10'])
	})

	it('Should not find definition when not been start of right most descendant part', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class-not-match1', '"']), [])
		assert.deepStrictEqual(await gs(['class="', 'class-not-match2', '"']), [])
		assert.deepStrictEqual(await gs(['class="', 'class-not-match3', '"']), [])
		assert.deepStrictEqual(await gs(['class="', 'class-not-match4', '"']), [])
	})

	it('Should not find as definition when it use reference like "&:hover"', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class-sub-reference-not-match', '"']), ['.class-sub-reference-not-match'])
	})

	it('Should find definition inside <style> tag, be aware this is not available by default', async () => {
		assert.deepStrictEqual(await gs(['class="', 'css-class-in-style', '"']), ['.css-class-in-style'])
		assert.deepStrictEqual(await gs(['class="', 'scss-class-in-style', '"']), ['&-in-style'])
	})

	it('Should supports less language', async () => {
		assert.deepStrictEqual(await gs(['class="', 'less-class', '"']), ['.less-class'])
	})

	it('Should find right class definition even within sass nesting', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class1', '"']), ['.class1'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub-tail', '"']), ['&-tail'])
	})

	it('Should find right css variable definition', async () => {
		assert.deepStrictEqual(await gs(['var(', '--css-variable-name', ')']), ['--css-variable-name'])
	})
})



describe('Test Less', () => {
	before(prepare)

	it('Should supports less language', async () => {
		assert.deepStrictEqual(await gs(['class="', 'less-class', '"']), ['.less-class'])
	})

	it('Should find right class definition even within sass nesting', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class1', '"']), ['.class1'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'class1-sub-tail', '"']), ['&-tail'])
	})

	it('Should find right css variable definition', async () => {
		assert.deepStrictEqual(await gs(['var(', '--css-variable-name', ')']), ['--css-variable-name'])
	})
})



describe('Test Sass Indented', () => {
	before(prepare)

	it('Should support sass language', async () => {
		assert.deepStrictEqual(await gs(['class="', 'sass-class1', '"']), ['.sass-class1'])
		assert.deepStrictEqual(await gs(['class="', 'sass-class1-sub', '"']), ['&-sub'])
		assert.deepStrictEqual(await gs(['class="', 'sass-class1-sub-tail', '"']), ['&-tail'])
	})
})



describe('Test Finding Definitions in `@import ...`', () => {
	before(prepare)

	it.only('Should find right class definition in `@import...`', async () => {
		assert.deepStrictEqual(await gs(['class="', 'class-imported', '"']), ['.class-imported'])
	})
})


describe('Test Finding Definition from JSX', () => {
	before(prepare)

	it('Should find right id definition', async () => {
		assert.deepStrictEqual(await gs(['"', 'id1', '"'], jsxDocument), ['#id1'])
	})

	it('Should find right class definition', async () => {
		assert.deepStrictEqual(await gs(['"', 'class1', '"'], jsxDocument), ['.class1'])
		assert.deepStrictEqual(await gs(['"', 'class2', '"'], jsxDocument), ['.class2, .class3'])
	})

	it('Should find right class definition within expression', async () => {
		assert.deepStrictEqual(await gs(['', 'class3', ''], jsxDocument), ['.class2, .class3'])
		assert.deepStrictEqual(await gs(['', 'class4', ''], jsxDocument), ['.class4, .class4-sub'])
		assert.deepStrictEqual(await gs(['', 'class5', ''], jsxDocument), ['.class5'])
		assert.deepStrictEqual(await gs(['', 'class6', ''], jsxDocument), ['.class6'])
		assert.deepStrictEqual(await gs(['', 'class7', ''], jsxDocument), ['.class7'])
	})
})


describe('Test Finding Definition for Vue Files', () => {
	before(prepare)

	it('Should find inner class definition', async () => {
		assert.deepStrictEqual(await gs(['"', 'test-vue-inner-class', '"'], vueDocument), ['.test-vue-inner-class'])
	})

	it('Should find imported class definition', async () => {
		assert.deepStrictEqual(await gs(['"', 'test-vue-import-class', '"'], vueDocument), ['.test-vue-import-class'])
	})

	it('Should find imported class definition inside node_modules by style tag', async () => {
		assert.deepStrictEqual(await gs(['"', 'class-style-imported', '"'], vueDocument), ['.class-style-imported'])
	})
})
