import {
	CompletionItem,
	CompletionItemKind,
	Range,
	TextEdit,
} from 'vscode-languageserver'

import {TextDocument} from 'vscode-languageserver-textdocument'


/** Create a completion item from label strings. */
export function formatLabelsToCompletionItems(labels: string[], startOffset: number, length: number, document: TextDocument): CompletionItem[] {
	return labels.map(label => {
		let item = CompletionItem.create(label)
		item.kind = CompletionItemKind.Class

		let range = Range.create(document.positionAt(startOffset), document.positionAt(startOffset + length))

		item.textEdit = TextEdit.replace(
			range,
			label,
		)
		
		return item
	})
}


/** From `.a-b` and parent `.a`, get `&-b`. */
export function removeReferencePrefix(label: string, parentMainNames: string[]): string[] {
	let unPrefixedLabels: string[] = []

	for (let parentMainName of parentMainNames) {
		if (label.startsWith(parentMainName)) {
			let unPrefixedLabel = label.slice(parentMainName.length)

			if (unPrefixedLabel.length > 0) {
				unPrefixedLabels.push('&' + unPrefixedLabel)
			}
		}
	}

	return unPrefixedLabels
}
