import {Part, PartType} from './part'


/** 
 * CSS Variable Declaration Part represents a css variable declaration,
 * remember it's variable value, and comment.
 */
export class CSSVariableDefinitionPart extends Part {
	
	/** Previous comment text. */
	readonly comment: string | undefined

	/** Variable value text. */
	readonly value: string | undefined

	constructor(label: string, start: number, comment: string | undefined, value: string | undefined) {
		super(PartType.CSSVariableDefinition, label, start, -1)
		this.comment = comment
		this.value = value
	}
}

