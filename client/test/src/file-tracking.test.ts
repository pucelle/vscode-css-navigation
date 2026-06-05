import * as fs from 'fs'
import * as vscode from 'vscode'
import * as assert from 'assert'
import {sleep, getFixtureFileUri, prepare, searchSymbolNames as gs} from './helper'


describe('Test CSS File Tracking', () => {
	before(prepare)
	const scssURI = getFixtureFileUri('css/test.scss')

	it.skip('Should track CSS code changes come from vscode', async () => {
		const cssDocument = await vscode.workspace.openTextDocument(scssURI)
		const cssEditor = await vscode.window.showTextDocument(cssDocument)
		const insertedText = '\n.class-insert-from-vscode{color: red;}\n'
		await cssEditor.edit(edit => {
			edit.insert(cssDocument.positionAt(0), insertedText)
		})
		await sleep(1000)
		try {
			assert.deepStrictEqual(await gs(['class="', 'class-insert-from-vscode', '"']), ['.class-insert-from-vscode'])
		}
		finally {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
		}
	})

	it.skip('Should track CSS file changes on disk', async () => {
		const insertedText = '\n.class-insert-from-disk{color: red;}\n'
		const rawText = fs.readFileSync(scssURI.fsPath, 'utf8')
		const text = rawText + insertedText
		fs.writeFileSync(scssURI.fsPath, text, 'utf8')
		await sleep(1000)
		try {
			assert.deepStrictEqual(await gs(['class="', 'class-insert-from-disk', '"']), ['.class-insert-from-disk'])
		}
		finally {
			fs.writeFileSync(scssURI.fsPath, rawText, 'utf8')
		}
	})

	it.skip('Should track CSS file removal and creation on disk', async () => {
		const scssText = fs.readFileSync(scssURI.fsPath, 'utf8')
		fs.unlinkSync(scssURI.fsPath)
		await sleep(1000)

		try {
			assert.deepStrictEqual(await gs(['<', 'html', '>']), [])
		}
		finally {
			fs.writeFileSync(scssURI.fsPath, scssText, 'utf8')
		}

		await sleep(1000)
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})
})
