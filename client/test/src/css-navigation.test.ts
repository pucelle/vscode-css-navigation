import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as assert from 'assert'
import {getFixtureFileUri, activateExtension, sleep, searchHTMLDocument, getDefinitionSymbolName, getWorkspaceSymbolNames} from './helper'


describe('Test CSS definition', () => {
	const uri = getFixtureFileUri('index.html')
	let htmlDocument: vscode.TextDocument

	before(async () => {
		//wait for client to start
		await sleep(500)
		let extension = await activateExtension(uri)
		extension.channel.show()
		htmlDocument = await vscode.workspace.openTextDocument(uri)
		await vscode.window.showTextDocument(htmlDocument)
		await vscode.commands.executeCommand('workbench.action.keepEditor')

		//wait for server to start
		await sleep(2000)
	})

	async function gs([start, selector, end]: [string, string, string]): Promise<string[] | null> {
		return await searchSymbolNames(htmlDocument, [start, selector, end])
	}

	async function gws(query: string): Promise<string[]> {
		return await getWorkspaceSymbolNames(query)
	}

	context('Test CSS definition matches', () => {
		it('Should find right tag definition', async () => {
			assert.deepEqual(await gs(['<', 'html', '>']), ['html'])
			assert.deepEqual(await gs(['<', 'body', '>']), ['body'])
			assert.deepEqual(await gs(['<', 'custom-element', '>']), ['custom-element'])
		})

		it('Should find right class definition even whthin sass nesting', async () => {
			assert.deepEqual(await gs(['class="', 'class', '"']), ['.class'])
			assert.deepEqual(await gs(['class="', 'class-subclass', '"']), ['&-subclass'])
			assert.deepEqual(await gs(['class="', 'class-subclass-subclass2', '"']), ['&-subclass2'])
		})

		it('Should find right id definition even whthin sass nesting', async () => {
			assert.deepEqual(await gs(['id="', 'id', '"']), ['#id'])
			assert.deepEqual(await gs(['id="', 'id-subid', '"']), ['&-subid'])
			assert.deepEqual(await gs(['id="', 'id-subid-subid2', '"']), ['&-subid2'])
		})

		it('Should find right class definition as start part', async () => {
			assert.deepEqual(await gs(['class="', 'class-match1', '"']), ['.class-match1:hover'])
			assert.deepEqual(await gs(['class="', 'class-match2', '"']), ['.class-match2::before'])
			assert.deepEqual(await gs(['class="', 'class-match3', '"']), ['.class-match3[name=value]'])
		})

		it('Should find right class definition as right most descendant part', async () => {
			assert.deepEqual(await gs(['class="', 'class-match4', '"']), ['.class-any .class-match4'])
			assert.deepEqual(await gs(['class="', 'class-match5', '"']), ['.class-any .class-match5:hover'])
			assert.deepEqual(await gs(['class="', 'class-match6', '"']), ['.class-any > .class-match6'])
			assert.deepEqual(await gs(['class="', 'class-match7', '"']), ['.class-any + .class-match7'])
			assert.deepEqual(await gs(['class="', 'class-match8', '"']), ['.class-any ~ .class-match8'])
		})

		it('Should not find definition when not been start of right most descendant part', async () => {
			assert.deepEqual(await gs(['class="', 'class-not-match1', '"']), [])
			assert.deepEqual(await gs(['class="', 'class-not-match2', '"']), [])
			assert.deepEqual(await gs(['class="', 'class-not-match3', '"']), [])
			assert.deepEqual(await gs(['class="', 'class-not-match4', '"']), [])
		})

		it('Should exclude all symbols start with @', async () => {
			assert.deepEqual(await gs(['<', 'tag-not-match1', '>']), [])
		})
	})


	context('Test tracking CSS file changes', () => {
		let cssURI = getFixtureFileUri('css/test.scss')

		it('Should track CSS code changes come from vscode', async () => {
			let cssDocument = await vscode.workspace.openTextDocument(cssURI)
			let cssEditor = await vscode.window.showTextDocument(cssDocument)
			let insertedText = '\n.class-inserted-from-vscode{color: red;}\n'
			await cssEditor.edit(edit => {
				edit.insert(cssDocument.positionAt(0), insertedText)
			})
			await sleep(1000)
			let err: Error | undefined
			try{
				assert.deepEqual(await gs(['class="', 'class-inserted-from-vscode', '"']), ['.class-inserted-from-vscode'])
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
			let rawText = fs.readFileSync(cssURI.fsPath, 'utf8')
			let text = rawText + insertedText
			fs.writeFileSync(cssURI.fsPath, text, 'utf8')
			await sleep(1000)
			let err: Error | undefined
			try{
				assert.deepEqual(await gs(['class="', 'class-inserted-on-disk', '"']), ['.class-inserted-on-disk'])
			}
			catch (e) {
				err = e
			}
			fs.writeFileSync(cssURI.fsPath, rawText, 'utf8')
			if (err) {
				throw err
			}
		})

		it('Should track CSS file removal and creation on disk', async () => {
			let rawText = fs.readFileSync(cssURI.fsPath, 'utf8')
			fs.unlinkSync(cssURI.fsPath)
			await sleep(1000)
			assert.deepEqual(await gs(['class="', 'class', '"']), [])
			fs.writeFileSync(cssURI.fsPath, rawText, 'utf8')
			await sleep(1000)
			assert.deepEqual(await gs(['class="', 'class', '"']), ['.class'])
		})

		it('Should track folder renaming on disk, and should ignore node_modules', async () => {
			let dirName = path.dirname(cssURI.fsPath)
			let renameTo = path.dirname(dirName) + '/node_modules'
			fs.renameSync(dirName, renameTo)
			await sleep(1000)
			let err: Error | undefined
			try{
				assert.deepEqual(await gs(['class="', 'class', '"']), [])
			}
			catch (e) {
				err = e
			}
			fs.renameSync(renameTo, dirName)
			await sleep(1000)
			assert.deepEqual(await gs(['class="', 'class', '"']), ['.class'])
			if (err) {
				throw err
			}
		})
	})


	context('Test workspace symbol', () => {
		it('Should find any symbol when query starts with it', async () => {
			assert.ok((await gws('class')).length > 0)
		})

		it('Should find any symbol when left word boundary match in the middle', async () => {
			assert.ok((await gws('subclass')).length > 0)
		})

		it('Should not find any symbol when left word boundary not match', async () => {
			assert.ok((await gws('lass')).length === 0)
		})

		it('Should find any symbol when query doesn\'t starts with a not [a-z] character and left word boundary match', async () => {
			assert.ok((await gws('-subclass')).length > 0)
		})

		it('Should find original symbol name if the nesting fixed name is not match', async () => {
			assert.ok((await gws('&-subclass')).length > 0)
		})

		it('Should fix nested symbol name which starts with "&"', async () => {
			assert.deepEqual(await gws('.class-subclass'), ['.class-subclass', '.class-subclass-subclass2'])
			assert.deepEqual(await gws('.class-subclass-subclass2'), ['.class-subclass-subclass2'])
		})
	})


	// it('Keep to view logs', async () => {
	// 	await sleep(60000)
	// })
})


let searchSymbolNames = async (htmlDocument: vscode.TextDocument, [start, selector, end]: [string, string, string]): Promise<string[] | null> => {
	let ranges = searchHTMLDocument(htmlDocument, [start, selector, end])
	let searchWord = start + selector + end

	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in index.html`)
		return null
	}

	let symbolNamesOfStart = await getDefinitionSymbolName(htmlDocument, ranges.in.start)
	let symbolNamesOfEnd = await getDefinitionSymbolName(htmlDocument, ranges.in.end)

	assert.deepEqual(symbolNamesOfStart, symbolNamesOfEnd, 'Can find same definition from start and end position')

	let symbolNamesOutOfStart = await getDefinitionSymbolName(htmlDocument, ranges.out.start)
	let symbolNamesOutOfEnd = await getDefinitionSymbolName(htmlDocument, ranges.out.end)

	assert.ok(symbolNamesOutOfStart.length === 0, `Can't find definition from out of left range`)
	assert.ok(symbolNamesOutOfEnd.length === 0, `Can't find definition from out of left range`)

	return symbolNamesOfStart
}
