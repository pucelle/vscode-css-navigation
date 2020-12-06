import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as assert from 'assert'
import {sleep, getFixtureFileUri, prepare, searchSymbolNames as gs} from './helper'


describe('Test CSS File Tracking', () => {
	before(prepare)
	let scssURI = getFixtureFileUri('css/test.scss')
	let cssURI = getFixtureFileUri('css/test.css')

	it('Should track CSS code changes come from vscode', async () => {
		let cssDocument = await vscode.workspace.openTextDocument(scssURI)
		let cssEditor = await vscode.window.showTextDocument(cssDocument)
		let insertedText = '\n.class-inserted-from-vscode{color: red;}\n'
		await cssEditor.edit(edit => {
			edit.insert(cssDocument.positionAt(0), insertedText)
		})
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['class="', 'class-inserted-from-vscode', '"']), ['.class-inserted-from-vscode'])
		}
		catch (e) {
			err = e
		}
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
		if (err) {
			throw err
		}
	})

	it('Should track CSS file changes on disk', async () => {
		let insertedText = '\n.class-inserted-on-disk{color: red;}\n'
		let rawText = fs.readFileSync(scssURI.fsPath, 'utf8')
		let text = rawText + insertedText
		fs.writeFileSync(scssURI.fsPath, text, 'utf8')
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['class="', 'class-inserted-on-disk', '"']), ['.class-inserted-on-disk'])
		}
		catch (e) {
			err = e
		}
		fs.writeFileSync(scssURI.fsPath, rawText, 'utf8')
		if (err) {
			throw err
		}
	})

	it('Should track CSS file removal and creation on disk, and should use CSS file as instead after same name SCSS file removed', async () => {
		let scssText = fs.readFileSync(scssURI.fsPath, 'utf8')
		fs.unlinkSync(scssURI.fsPath)
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
		}
		catch (e) {
			err = e
		}
		let cssText = fs.readFileSync(cssURI.fsPath, 'utf8')
		fs.unlinkSync(cssURI.fsPath)
		await sleep(1000)
		let err2
		try{
			assert.deepStrictEqual(await gs(['<', 'html', '>']), [])
		}
		catch (e) {
			err2 = e
		}
		fs.writeFileSync(scssURI.fsPath, scssText, 'utf8')
		fs.writeFileSync(cssURI.fsPath, cssText, 'utf8')
		if (err || err2) {
			throw err || err2
		}
		await sleep(1000)
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})

	it('Should track folder renaming on disk, and should ignore `vendor` by default', async () => {
		let dirName = path.dirname(scssURI.fsPath)
		let renameTo = path.dirname(dirName) + '/vendor'
		fs.renameSync(dirName, renameTo)
		await sleep(1000)
		let err
		try{
			assert.deepStrictEqual(await gs(['<', 'html', '>']), [])
		}
		catch (e) {
			err = e
		}
		fs.renameSync(renameTo, dirName)
		if (err) {
			throw err
		}
		await sleep(1000)
		assert.deepStrictEqual(await gs(['<', 'html', '>']), ['html'])
	})
})
