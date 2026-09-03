import {describe, expect, it} from 'vitest'
import {CSSTokenTree, PartType} from '../../server/src/languages'


function getCSSVariableReferences(text: string) {
	return [...CSSTokenTree.fromString(text, 0, 'scss').walkParts()]
		.filter(part => part.type === PartType.CSSVariableReference)
		.map(part => ({text: part.escapedText, start: part.start}))
}


describe('CSS variables', () => {
	it.each([
		`@include sass-mixin(
			(container-padding: var(--css-variable-color))
		);`,
		`@include sass-mixin(
			$properties: (container-padding: var(--css-variable-color))
		);`,
		`@include sass-mixin(
			$variable: var(--css-variable-color)
		);`,
	])('finds references in Sass mixin parameters', text => {
		expect(getCSSVariableReferences(text)).toEqual([{
			text: '--css-variable-color',
			start: text.indexOf('--css-variable-color'),
		}])
	})
})
