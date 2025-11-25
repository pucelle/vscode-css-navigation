import {describe, it, expect} from 'vitest'
import {CSSClassInExpressionTokenScanner, CSSClassInExpressionTokenType} from '../../../server/src/languages/scanners/css-class-in-expression'


function scan(
	text: string,
	languageId: 'jsx'|'tsx'|'js'|'ts'|'html'|'vue'|'css'|'less'|'sass'|'scss',
	readyAnExpression = false,
) {
	let scanner = new CSSClassInExpressionTokenScanner(text, 0, languageId as any, readyAnExpression)
	return Array.from(scanner.parseToTokens())
}

function classNames(tokens: Array<{type: number, text: string}>) {
	return tokens.filter(t => t.type === CSSClassInExpressionTokenType.ClassName).map(t => t.text)
}

function moduleNames(tokens: Array<{type: number, text: string}>) {
	return tokens.filter(t => t.type === CSSClassInExpressionTokenType.ReactModuleName).map(t => t.text)
}

function moduleProperties(tokens: Array<{type: number, text: string}>) {
	return tokens.filter(t => t.type === CSSClassInExpressionTokenType.ReactModuleProperty).map(t => t.text)
}

function potentialClassNameCompletions(tokens: Array<{type: number, text: string}>) {
	return tokens.filter(t => t.type === CSSClassInExpressionTokenType.PotentialClassName).map(t => t.text)
}


describe('CSSClassInExpressionTokenScanner', () => {
	describe('JSX: class, className', () => {
		it('scans class="class1"', () => {
			let tokens = scan('"class1"', 'jsx')
			expect(classNames(tokens)).toContain('class1')
		})

		it("scans className={'class2'}", () => {
			let tokens = scan("{'class2'}", 'jsx')
			expect(classNames(tokens)).toContain('class2')
		})

		it('scans className={`any-other-class class3`}', () => {
			let tokens = scan('`any-other-class class3`', 'jsx')
			let classes = classNames(tokens)
			expect(classes).toContain('any-other-class')
			expect(classes).toContain('class3')
		})

		it('scans className={`any-other-class ` + any + ` class4`}', () => {
			let tokens = scan('`any-other-class ` + any_variable_or_expression + ` class4`', 'jsx')
			let classes = classNames(tokens)
			expect(classes).toContain('any-other-class')
			expect(classes).toContain('class4')
		})

		it('scans className={`class-${variable}`}', () => {
			let tokens = scan('{`class-${variable}`}', 'jsx')
			let classes = classNames(tokens)
			expect(classes.length).toBe(0)
		})

		it('scans className={"class-\${variable}"}', () => {
			let tokens = scan(`"class-\${variable}"`, 'jsx')
			let classes = classNames(tokens)
			expect(classes.length).toBe(0)
		})

		it('scans className={style.class5}', () => {
			let tokens = scan('{style.class5}', 'jsx')
			expect(moduleNames(tokens)).toContain('style')
			expect(moduleProperties(tokens)).toContain('class5')
		})

		it("scans className={style['class5']}", () => {
			let tokens = scan("{style['class5']}", 'jsx')
			expect(moduleNames(tokens)).toContain('style')
			expect(moduleProperties(tokens)).toContain('class5')
		})

		it('scans className={`${style.class5} ${style.class5}`}', () => {
			let tokens = scan('`${style.class5} ${style.class5}`', 'jsx')
			let props = moduleProperties(tokens).filter(p => p === 'class5')
			expect(props.length).toBe(2)
		})

		it('scans className={class6: this.show}', () => {
			let tokens = scan('{class6: this.show}', 'jsx', true)
			let classes = classNames(tokens)
			expect(classes).toContain('class6')
		})

		it('scans className={"class6": this.show}', () => {
			let tokens = scan('{"class6": this.show}', 'jsx', true)
			let classes = classNames(tokens)
			expect(classes).toContain('class6')
		})

		it('scans className={{key: value}}, and should ignore value', () => {
			let tokens = scan("{class6: 'non-class'}", 'jsx', true)
			let classes = classNames(tokens)
			expect(classes).toContain('class6')
			expect(classes).not.toContain('non-class')
		})

		it('scans className={array of strings and objects, and arrays}', () => {
			let tokens = scan("{['class7', {class8: this.show}, ['class9']]}", 'jsx')
			let classes = classNames(tokens)
			expect(classes).toContain('class7')
			expect(classes).toContain('class8')
			expect(classes).toContain('class9')
		})

		it('scans className={`...`}, with multi line expressions', () => {
			let tokens = scan(`{
					\`class10 \${isMissingLocals
						? ' missing-locals' : ''} \${isMissingRef
						? ' missing-ref' : ''} \${isNew
						? ' new' : '' } \${isError
						? ' error' : ''} \${focusedItem === node.structureKey
						? ' focused' : ''}\`
				}`, 'jsx')
			let classes = classNames(tokens)
			expect(classes).toContain('class10')
			expect(classes).not.toContain('isMissingRef')
		})
	})

	describe('PotentialClassNameCompletion', () => {
		it("scans class=''", () => {
			let tokens = scan("''", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain('')
		})

		it("scans class=' a'", () => {
			let tokens = scan("' a'", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain('')
		})

		it("scans class='b '", () => {
			let tokens = scan("' a'", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain('')
		})

		it("scans class='a b'", () => {
			let tokens = scan("'a b'", 'jsx')
			expect(potentialClassNameCompletions(tokens).length).toBe(0)
		})

		it("scans class='a  b'", () => {
			let tokens = scan("'a  b'", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain('')
		})

		it("scans class='a   b'", () => {
			let tokens = scan("'a   b'", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain(' ')
		})

		it("scans :class={''}", () => {
			let tokens = scan("{''}", 'jsx')
			expect(potentialClassNameCompletions(tokens)).toContain('')
		})
	})
})

