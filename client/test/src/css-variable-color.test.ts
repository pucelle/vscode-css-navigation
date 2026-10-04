import * as assert from 'assert'
import * as vscode from 'vscode'
import {getFixtureFileUri, prepare} from './helper'


describe('Test CSS Variable Color Preview', () => {
	let document: vscode.TextDocument
	let colors: vscode.ColorInformation[]

	before(async () => {
		await prepare()
		document = await vscode.workspace.openTextDocument(getFixtureFileUri('css/variable-colors.css'))
		await vscode.window.showTextDocument(document)
		colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
			'vscode.executeDocumentColorProvider', document.uri,
		)
	})

	it('Should preview a CSS variable alias and a multi-level alias', () => {
		assertReferenceColor('.co-rd', '--co-page')
		assertReferenceColor('.co-rd', '--co-page-chain')
	})

	it('Should preview aliases whose color is defined in an imported CSS file', () => {
		assertReferenceColor('.co-workspace', '--co-workspace-page')
	})

	it('Should skip cyclic, missing and non-color variable aliases', () => {
		for (let name of ['--co-cycle-a', '--co-self-cycle', '--co-missing-alias', '--co-spacing-alias']) {
			let range = referenceRange('.co-unresolved', name)
			assert.ok(!colors.some(item => item.range.isEqual(range)), `Unexpected preview for ${name}`)
		}
	})


	/** Verify both the preview's reference range and its resolved RGB value. */
	function assertReferenceColor(selector: string, name: string) {
		let range = referenceRange(selector, name)
		let item = colors.find(item => item.range.isEqual(range))
		assert.ok(item, `Missing preview for ${name}`)
		assert.ok(Math.abs(item.color.red - 239 / 255) < 0.000001)
		assert.ok(Math.abs(item.color.green - 68 / 255) < 0.000001)
		assert.ok(Math.abs(item.color.blue - 68 / 255) < 0.000001)
		assert.strictEqual(item.color.alpha, 1)
	}


	/** Locate a variable reference in a fixture rule rather than its declaration. */
	function referenceRange(selector: string, name: string): vscode.Range {
		let text = document.getText()
		let ruleStart = text.indexOf(selector + ' {')
		let referenceStart = text.indexOf(`var(${name})`, ruleStart)
		assert.ok(ruleStart >= 0 && referenceStart >= 0, `Missing fixture reference for ${name}`)
		let start = referenceStart + 4
		return new vscode.Range(document.positionAt(start), document.positionAt(start + name.length))
	}
})
