import {TextDocument} from 'vscode-languageserver-textdocument'
import {Part, PartType} from './part'
import {Command, CompletionItem, CompletionItemKind, TextEdit} from 'vscode-languageserver'
import {PartConvertor} from './part-convertor'
import {Color} from '../../utils'
import {CompletionLabel} from '../services/types'


export enum CompletionLabelType {
	CSSVariable,
	Definition,
	Reference,
}


/** Merge several groups of completion labels. */
export class CompletionLabels {

	private typeMap: Map<string, CompletionLabelType> = new Map()
	private detailMap: Map<string, CompletionLabel | null> = new Map()

	add(type: CompletionLabelType, labelMap: Map<string, CompletionLabel | null>) {
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

	/** If `forceForOffset` specified, reset text edit to this offset. */
	output(fromPart: Part, document: TextDocument, forceEditCollapseToOffset: number | undefined = undefined): CompletionItem[] {
		let items: CompletionItem[] = []

		let collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base', ignorePunctuation: true})
		let sortedTexts = [...this.typeMap.keys()].sort(collator.compare)

		for (let i = 0; i < sortedTexts.length; i++) {
			let kind: CompletionItemKind
			let text = sortedTexts[i]
			let type = this.typeMap.get(text)

			if (type === CompletionLabelType.CSSVariable) {
				kind = CompletionItemKind.Variable
			}
			else if (type === CompletionLabelType.Definition) {
				kind = CompletionItemKind.Class
			}
			else {
				kind = CompletionItemKind.Value
			}

			let label = this.detailMap.get(text)
			let detail = label?.text

			// Completion supports only HEX color type.
			if (type === CompletionLabelType.CSSVariable && detail) {
				let color = Color.fromString(detail)
				if (color) {
					kind = CompletionItemKind.Color
					detail = color.toHEX()
				}
			}

			// Before completion items expanded, shows detail,
			// After expanded, shows documentation.
			// If both provided, shows detail + documentation after expanded.
			let documentation = label?.markdown

			// Use space because it's char code is 32, lower than any other visible characters.
			let sortText = ' ' + String(i).padStart(3, '0')
			let insertText = text
			let command: Command | undefined
			
			// `--name` -> `var(--name)`
			if (fromPart.type === PartType.CSSVariableReferenceNoVar) {
				insertText = `var(${text})`
			}

			// Reset text edit collapse to the specified offset.
			let range = PartConvertor.toRange(fromPart, document)
			if (forceEditCollapseToOffset !== undefined) {
				range.start = range.end = document.positionAt(forceEditCollapseToOffset)
			}

			// `--` -> `--name: |;`
			if (fromPart.type === PartType.CSSVariableDefinitionNotComplete) {
				insertText = text + ': ;'
				command = Command.create('Move cursor forward for one character', 'CSSNavigation.moveCursorForward')
			}

			let textEdit = TextEdit.replace(
				PartConvertor.toRange(fromPart, document),
				insertText,
			)

			let item: CompletionItem = {
				kind,
				label: text,
				detail,
				sortText,
				textEdit,
				command,
				documentation: documentation ? {kind: 'markdown', value: documentation} : undefined
			}

			items.push(item)
		}

		return items
	}
}
