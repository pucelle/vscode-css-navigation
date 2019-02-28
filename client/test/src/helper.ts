import * as path from 'path'
import * as assert from 'assert'
import * as vscode from 'vscode'
import {CSSNavigationExtension} from '../../out/extension';

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

let htmlDocument: vscode.TextDocument
let cssDocument: vscode.TextDocument
export async function prepare() {
	if (htmlDocument) {
		return htmlDocument
	}

	//wait for client to start
	await sleep(500)
	let extension = await getExtensionExport()
	extension.channel.show()

	htmlDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('index.html'))
	await vscode.window.showTextDocument(htmlDocument)
	await vscode.commands.executeCommand('workbench.action.keepEditor')

	cssDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('css/test.scss'))
	await vscode.window.showTextDocument(htmlDocument)
	await vscode.commands.executeCommand('workbench.action.keepEditor')

	//wait for server to start
	await sleep(2000)
}

export function getFixtureFileUri(relativePath: string): vscode.Uri {
	return vscode.Uri.file(path.resolve(__dirname, '../fixture', relativePath))
}

async function getExtensionExport(): Promise<CSSNavigationExtension> {
	let ext = vscode.extensions.getExtension('pucelle.vscode-css-navigation')!
	await ext.activate()
	return ext.exports
}



export async function searchSymbolNames ([start, selector, end]: [string, string, string]): Promise<string[] | null> {
	let ranges = searchHTMLDocumentForSelector([start, selector, end])
	let searchWord = start + selector + end

	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in index.html`)
		return null
	}

	let symbolNamesOfStart = await getSymbolNamesAtPosition(ranges.in.start)
	let symbolNamesOfEnd = await getSymbolNamesAtPosition(ranges.in.end)

	assert.deepEqual(symbolNamesOfStart, symbolNamesOfEnd, 'Can find same definition from start and end position')

	let symbolNamesOutOfStart = await getSymbolNamesAtPosition(ranges.out.start)
	let symbolNamesOutOfEnd = await getSymbolNamesAtPosition(ranges.out.end)

	assert.ok(symbolNamesOutOfStart.length === 0, `Can't find definition from out of left range`)
	assert.ok(symbolNamesOutOfEnd.length === 0, `Can't find definition from out of left range`)

	return symbolNamesOfStart
}

function searchHTMLDocumentForSelector([start, selector, end]: [string, string, string]): {in: vscode.Range, out: vscode.Range} | null {
	let searchWord = start + selector + end
	let matchRange: any
	let outerRange: any

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
		return null
	}

	return {
		in: matchRange!,
		out: outerRange!
	}
}

async function getSymbolNamesAtPosition(position: vscode.Position): Promise<string[]> {
	let locations = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, position)
	let symbolNames = []

	for (let location of locations) {
		symbolNames.push(await getCodePieceFromLocation(location))
	}

	return symbolNames
}

async function getCodePieceFromLocation(location: vscode.Location): Promise<string> {
	let cssDocument = await vscode.workspace.openTextDocument(location.uri)
	let text = cssDocument.getText()
 	return text.slice(cssDocument.offsetAt(location.range.start), cssDocument.offsetAt(location.range.end)).replace(/\s*\{[\s\S]+/, '')
}




export async function searchWorkspaceSymbolNames(query: string): Promise<string[]> {
	let symbols = <vscode.SymbolInformation[]>await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)
	let symbolNames = symbols.map(symbol => symbol.name)

	return symbolNames
}



export async function searchReferences (searchWord: string, inHTML: boolean = false): Promise<string[] | null> {
	let document = inHTML ? htmlDocument : cssDocument
	let ranges = searchWordInDocument(searchWord, document)
	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in ${path.basename(document.uri.toString())}`)
		return null
	}

	let symbolNamesOfStart = await getReferenceNamesAtPosition(ranges.in.start, document)
	let symbolNamesOfEnd = await getReferenceNamesAtPosition(ranges.in.end, document)

	assert.deepEqual(symbolNamesOfStart, symbolNamesOfEnd, 'Can find same references from start and end position')

	let symbolNamesOutOfStart = await getReferenceNamesAtPosition(ranges.out.start, document)
	let symbolNamesOutOfEnd = await getReferenceNamesAtPosition(ranges.out.end, document)

	assert.ok(symbolNamesOutOfStart.length === 0, `Can't find reference from out of left range`)
	assert.ok(symbolNamesOutOfEnd.length === 0, `Can't find reference from out of left range`)

	return symbolNamesOfStart
}

function searchWordInDocument(searchWord: string, document: vscode.TextDocument): {in: vscode.Range, out: vscode.Range} | null {
	let matchRange: any
	let outerRange: any

	for (let i = 0; i < document.lineCount; i++) {
		let line = document.lineAt(i)
		let index = line.text.indexOf(searchWord)
		if (index > -1) {
			matchRange = new vscode.Range(
				new vscode.Position(i, index),
				new vscode.Position(i, index + searchWord.length)
			)
			outerRange = new vscode.Range(
				document.positionAt(document.offsetAt(new vscode.Position(i, index)) - 1),
				document.positionAt(document.offsetAt(new vscode.Position(i, index + searchWord.length)) + 1)
			)
			break
		}
	}

	if (!matchRange || !outerRange) {
		return null
	}

	return {
		in: matchRange!,
		out: outerRange!
	}
}

async function getReferenceNamesAtPosition(position: vscode.Position, document: vscode.TextDocument): Promise<string[]> {
	let locations = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeReferenceProvider', document.uri, position)
	let referenceNames = []

	for (let location of locations) {
		if (location.uri.toString().endsWith('.html')) {
			referenceNames.push(await getCodePieceFromLocation(location))
		}
	}

	return referenceNames
}
