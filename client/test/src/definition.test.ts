import * as vscode from 'vscode'
import * as assert from 'assert'
import { getFixtureFileUri, activateExtension, sleep } from './helper'


describe('Test CSS definition', () => {
	const uri = getFixtureFileUri('index.html')
	let htmlDocument: vscode.TextDocument

	before(async () => {
		//wait for client to start
		await sleep(500)
		let extension = await activateExtension(uri)
		htmlDocument = await vscode.workspace.openTextDocument(uri)
		await vscode.window.showTextDocument(htmlDocument)

		//wait for server to start
		await sleep(1000)
	})

	it('Should find right CSS definitions from HTML tag', async () => {
		await searchAndMathDefitions(htmlDocument, ['<', 'html', '>'], 'html')
		await searchAndMathDefitions(htmlDocument, ['<', 'body', '>'], 'body')
		await searchAndMathDefitions(htmlDocument, ['<', 'custom-element', '>'], 'custom-element')
	})

	it('Should find right CSS definitions from class name', async () => {
		await searchAndMathDefitions(htmlDocument, ['class="', 'class', '"'], '.class')
		await searchAndMathDefitions(htmlDocument, ['class="', 'class-subclass', '"'], '&-subclass')
		await searchAndMathDefitions(htmlDocument, ['class="', 'class-subclass-subclass2', '"'], '&-subclass2')
	})

	it('Should find right CSS definitions from id', async () => {
		await searchAndMathDefitions(htmlDocument, ['id="', 'id', '"'], '#id')
		await searchAndMathDefitions(htmlDocument, ['id="', 'id-subid', '"'], '&-subid')
		await searchAndMathDefitions(htmlDocument, ['id="', 'id-subid-subid2', '"'], '&-subid2')
	})
})


let searchAndMathDefitions = async (htmlDocument: vscode.TextDocument, [ start, selector, end ]: [ string, string, string ], expectedSymbolName: string) => {
	let searchWord = start + selector + end
	let matchRange: vscode.Range | null = null
	let outerRange: vscode.Range | null = null

	for (let i = 0; i < htmlDocument.lineCount; i++) {
		let line = htmlDocument.lineAt(i)
		let index = line.text.indexOf(searchWord)
		if (index > -1) {
			matchRange = new vscode.Range(
				new vscode.Position(i, index + start.length),
				new vscode.Position(i, index + start.length + selector.length)
			)
			outerRange = new vscode.Range(
				new vscode.Position(i, index + start.length - 1),
				new vscode.Position(i, index + start.length + selector.length + 1)
			)
			break
		}
	}

	if (!matchRange || !outerRange) {
		assert.fail(`Cant find "${searchWord}" in index.html`)
		return
	}

	let definitionListInStart = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, matchRange.start)
	let definitionListInEnd = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, matchRange.end)

	assert.ok(definitionListInStart.length > 0, `Can found definition by "${searchWord}"`)
	assert.ok(definitionListInStart.length === definitionListInEnd.length, 'Can find definitions in both start and end position')

	for (let location of definitionListInStart) {
		let { uri: cssURI, range } = location
		let cssDocument = await vscode.workspace.openTextDocument(cssURI)
		let text = cssDocument.getText()

		let symbolName = text.slice(cssDocument.offsetAt(location.range.start), cssDocument.offsetAt(location.range.end)).replace(/\s*\{[\s\S]+/, '')
		assert.equal(symbolName, expectedSymbolName, `Can find CSS defitions by "${searchWord}"`)
	}

	let definitionListOutofRangeInStart = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, outerRange.start)
	let definitionListOutofRangeInEnd = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, outerRange.end)

	assert.ok(definitionListOutofRangeInStart.length === 0, `Cant found definition since out of range in left`)
	assert.ok(definitionListOutofRangeInEnd.length === 0, `Cant found definition since out of range in right`)
}
