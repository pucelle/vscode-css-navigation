import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as assert from 'assert'
import {sleep, getFixtureFileUri, prepare, searchSymbolNames as gs} from './helper'


describe('Test CSS File Tracking', () => {
	before(prepare)
	let scssURI = getFixtureFileUri('css/test.scss')

	it.skip('Should track CSS code changes come from vscode', async () => {
		let cssDocument = await vscode.workspace.openTextDocument(scssURI)
		let cssEditor = await vscode.window.showTextDocument(cssDocument)
		let insertedText = '\n.class-insert-from-vscode{color: red;}\n'
		await cssEditor.edit(edit => {
			edit.insert(cssDocument.positionAt(0), insertedText)
		})
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['class="', 'class-insert-from-vscode', '"']), ['.class-insert-from-vscode'])
		}
		catch (e) {
			err = e
		}
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
		if (err) {
			throw err
		}
	})

	it.skip('Should track CSS file changes on disk', async () => {
		let insertedText = '\n.class-insert-from-disk{color: red;}\n'
		let rawText = fs.readFileSync(scssURI.fsPath, 'utf8')
		let text = rawText + insertedText
		fs.writeFileSync(scssURI.fsPath, text, 'utf8')
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['class="', 'class-insert-from-disk', '"']), ['.class-insert-from-disk'])
		}
		catch (e) {
			err = e
		}
		fs.writeFileSync(scssURI.fsPath, rawText, 'utf8')
		if (err) {
			throw err
		}
	})

	it.skip('Should track CSS file removal and creation on disk', async () => {
		let scssText = fs.readFileSync(scssURI.fsPath, 'utf8')
		fs.unlinkSync(scssURI.fsPath)
		await sleep(1000)

		let err
		try{
			assert.deepStrictEqual(await gs(['<', 'html', '>']), [])
		}
		catch (e) {
			err = e
		}

		fs.writeFileSync(scssURI.fsPath, scssText, 'utf8')

		if (err) {
			throw err
		}

		await sleep(1000)
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})
})
