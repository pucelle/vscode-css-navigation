import * as assert from 'assert'
import * as vscode from 'vscode'
import {getFixtureFileUri, prepare} from './helper'


describe('Test Nested Selector Rename', () => {
	let scssDocument: vscode.TextDocument
	let htmlDocument: vscode.TextDocument
	let tsDocument: vscode.TextDocument

	before(async () => {
		await prepare()
		scssDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('css/rename.scss'))
		htmlDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('rename.html'))
		tsDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('rename.ts'))
	})

	it('Should rename the Sass suffix and its HTML reference from SCSS', async () => {
		await assertRename(scssDocument, '&-je-portrait', '&-portrait')
	})

	it('Should rename the HTML class and its Sass suffix from HTML', async () => {
		await assertRename(htmlDocument, 'maps-je-portrait', 'maps-portrait')
	})

	it('Should rename the embedded HTML class and its Sass suffix from TypeScript', async () => {
		await assertRename(tsDocument, 'maps-je-portrait', 'maps-portrait')
	})


	/** Exercise the actual VS Code provider selection and validate cross-file edits. */
	async function assertRename(document: vscode.TextDocument, oldName: string, newName: string) {
		await vscode.window.showTextDocument(document)
		let offset = document.getText().indexOf(oldName) + 2

		let edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
			'vscode.executeDocumentRenameProvider', document.uri, document.positionAt(offset), newName,
		)

		assert.ok(edit, 'Expected a workspace rename edit')
		assert.strictEqual(applyEdits(scssDocument, edit), scssDocument.getText().replace('&-je-portrait', '&-portrait'))
		assert.strictEqual(applyEdits(htmlDocument, edit), htmlDocument.getText().replace('maps-je-portrait', 'maps-portrait'))
		assert.strictEqual(applyEdits(tsDocument, edit), tsDocument.getText().replace('maps-je-portrait', 'maps-portrait'))
	}


	/** Apply returned edits in memory so the checked-in fixtures remain unchanged. */
	function applyEdits(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): string {
		let text = document.getText()
		let edits = edit.get(document.uri).sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start))

		for (let replacement of edits) {
			let start = document.offsetAt(replacement.range.start)
			let end = document.offsetAt(replacement.range.end)
			text = text.slice(0, start) + replacement.newText + text.slice(end)
		}

		return text
	}
})
