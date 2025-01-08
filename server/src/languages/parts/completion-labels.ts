import {TextDocument} from 'vscode-languageserver-textdocument'
import {Part, PartType} from './part'
import {CompletionItem, CompletionItemKind, TextEdit} from 'vscode-languageserver'
import {PartConvertor} from './part-convertor'
import {Color} from '../../helpers'


export enum CompletionLabelType {
	CSSVariable,
	Definition,
	Reference,
}


/** Merge several groups of completion labels. */
export class CompletionLabels {

	private typeMap: Map<string, CompletionLabelType> = new Map()
	private detailMap: Map<string, string | undefined> = new Map()

	add(type: CompletionLabelType, labelMap: Map<string, string | undefined>) {
		for (let [label, detail] of labelMap) {
			if (!this.typeMap.has(label) || this.typeMap.get(label)! < type) {
				this.typeMap.set(label, type)
				this.detailMap.set(label, detail)
			}
		}
	}

	remove(labels: Iterable<string>) {
		for (let label of labels) {
			this.typeMap.delete(label)

			// No need to delete details, wait them to be GC.
		}
	}

	output(fromPart: Part, document: TextDocument): CompletionItem[] {
		let items: CompletionItem[] = []

		let collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base', ignorePunctuation: true})
		let sortedLabels = [...this.typeMap.keys()].sort(collator.compare)

		for (let i = 0; i < sortedLabels.length; i++) {
			let kind: CompletionItemKind
			let label = sortedLabels[i]
			let type = this.typeMap.get(label)

			if (type === CompletionLabelType.CSSVariable) {
				kind = CompletionItemKind.Variable
			}
			else if (type === CompletionLabelType.Definition) {
				kind = CompletionItemKind.Class
			}
			else {
				kind = CompletionItemKind.Value
			}

			let value = this.detailMap.get(label)
			let detail = value

			if (type === CompletionLabelType.CSSVariable && value) {
				let color = Color.fromString(value)
				if (color) {
					kind = CompletionItemKind.Color
					detail = color.toHEX()
				}
			}


			// Use space because it's char code is 32, lower than any other visible characters.
			let sortText = ' ' + String(i).padStart(3, '0')
			let insertText = label

			// `--name` -> `var(--name)`
			if (fromPart.type === PartType.CSSVariableReferenceNoVar) {
				insertText = `var(${label})`
			}

			let textEdit = TextEdit.replace(
				PartConvertor.toRange(fromPart, document),
				insertText,
			)
	
			let item: CompletionItem = {
				kind,
				label,
				detail,
				sortText,
				textEdit,
			}

			items.push(item)
		}

		return items
	}
}
