import * as path from 'path'
import * as assert from 'assert'
import * as vscode from 'vscode'
import {CSSNavigationExtension} from '../../out/extension'


export function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export let htmlDocument: vscode.TextDocument
export let cssDocument: vscode.TextDocument
export let jsxDocument: vscode.TextDocument

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

	jsxDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('index.jsx'))
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



export async function searchSymbolNames([start, selector, end]: [string, string, string], document: vscode.TextDocument = htmlDocument): Promise<string[] | null> {
	let ranges = searchDocumentForSelector([start, selector, end], document)
	let searchWord = start + selector + end

	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in index.html`)
		return null
	}

	let namesOfStart = await getSymbolNamesAtPosition(ranges.in.start, document)
	let namesOfEnd = await getSymbolNamesAtPosition(ranges.in.end, document)

	assert.deepEqual(namesOfStart, namesOfEnd, 'Can find same definition from start and end position')

	// Comment these because it's not right since there may be definitions for other languages exist.
	// let namesOutOfStart = await getSymbolNamesAtPosition(ranges.out.start, document)
	// let namesOutOfEnd = await getSymbolNamesAtPosition(ranges.out.end, document)

	// assert.ok(namesOutOfStart.length === 0, `Can't find definition from out of left range`)
	// assert.ok(namesOutOfEnd.length === 0, `Can't find definition from out of left range`)

	return namesOfStart
}

function searchDocumentForSelector([start, selector, end]: [string, string, string], document: vscode.TextDocument): {in: vscode.Range, out: vscode.Range} | null {
	let searchWord = start + selector + end
	let matchRange: any
	let outerRange: any

	for (let i = 0; i < document.lineCount; i++) {
		let line = document.lineAt(i)
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

async function getSymbolNamesAtPosition(position: vscode.Position, document: vscode.TextDocument): Promise<string[]> {
	let locations = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, position)
	let symbolNames = []

	for (let location of locations) {
		symbolNames.push(await getCodePieceFromLocation(location))
	}

	return symbolNames
}

async function getCodePieceFromLocation(location: vscode.Location): Promise<string> {
	let document = await vscode.workspace.openTextDocument(location.uri)
	let text = document.getText()
 	return text.slice(document.offsetAt(location.range.start), document.offsetAt(location.range.end)).replace(/\s*\{[\s\S]+/, '')
}



export async function searchWorkspaceSymbolNames(query: string): Promise<string[]> {
	let symbols = <vscode.SymbolInformation[]>await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)
	let symbolNames = symbols.map(symbol => symbol.name)

	return symbolNames
}



export async function searchReferences (searchWord: string, document: vscode.TextDocument = cssDocument): Promise<string[] | null> {
	let ranges = searchWordInDocument(searchWord, document)
	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in ${path.basename(document.uri.toString())}`)
		return null
	}

	let namesOfStart = await getReferenceNamesAtPosition(ranges.in.start, document)
	let namesOfEnd = await getReferenceNamesAtPosition(ranges.in.end, document)

	assert.deepEqual(namesOfStart, namesOfEnd, 'Can find same references from start and end position')

	let namesOutOfStart = await getReferenceNamesAtPosition(ranges.out.start, document)
	let namesOutOfEnd = await getReferenceNamesAtPosition(ranges.out.end, document)

	assert.ok(namesOutOfStart.length === 0, `Can't find reference from out of left range`)
	assert.ok(namesOutOfEnd.length === 0, `Can't find reference from out of left range`)

	return namesOfStart
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
			let codePiece = await getCodePieceFromLocation(location)
			if (codePiece.startsWith('<')) {
				referenceNames.push(codePiece)
			}
		}
	}

	return referenceNames
}



export async function searchCompletion (searchWord: string): Promise<string[] | null> {
	let ranges = searchWordInDocument(searchWord, htmlDocument)
	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in ${path.basename(htmlDocument.uri.toString())}`)
		return null
	}

	let namesOfEnd = await getCompletionNamesAtPosition(ranges.in.end)
	return namesOfEnd
}

async function getCompletionNamesAtPosition(position: vscode.Position): Promise<string[]> {
	let list = <vscode.CompletionList>await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', htmlDocument.uri, position)
	let completionNames = []

	for (let item of list.items) {
		completionNames.push(item.label)
	}

	return completionNames
}