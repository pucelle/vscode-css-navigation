import * as path from 'path'
import * as assert from 'assert'
import * as vscode from 'vscode'
import {CSSNavigationExtension} from '../../out/extension';

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

let htmlDocument: vscode.TextDocument
export async function prepare() {
	if (htmlDocument) {
		return htmlDocument
	}

	let uri = getFixtureFileUri('index.html')

	//wait for client to start
	await sleep(500)
	let extension = await getExtensionExport(uri)
	extension.channel.show()

	htmlDocument = await vscode.workspace.openTextDocument(uri)
	await vscode.window.showTextDocument(htmlDocument)
	await vscode.commands.executeCommand('workbench.action.keepEditor')

	//wait for server to start
	await sleep(2000)
}

export function getFixtureFileUri(relativePath: string): vscode.Uri {
	return vscode.Uri.file(path.resolve(__dirname, '../fixture', relativePath))
}

async function getExtensionExport(uri: vscode.Uri): Promise<CSSNavigationExtension> {
	let ext = vscode.extensions.getExtension('pucelle.vscode-css-navigation')!
	await ext.activate()
	return ext.exports
}


export async function searchSymbolNames ([start, selector, end]: [string, string, string]): Promise<string[] | null> {
	let ranges = searchHTMLDocument([start, selector, end])
	let searchWord = start + selector + end

	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in index.html`)
		return null
	}

	let symbolNamesOfStart = await getDefinitionSymbolName(ranges.in.start)
	let symbolNamesOfEnd = await getDefinitionSymbolName(ranges.in.end)

	assert.deepEqual(symbolNamesOfStart, symbolNamesOfEnd, 'Can find same definition from start and end position')

	let symbolNamesOutOfStart = await getDefinitionSymbolName(ranges.out.start)
	let symbolNamesOutOfEnd = await getDefinitionSymbolName(ranges.out.end)

	assert.ok(symbolNamesOutOfStart.length === 0, `Can't find definition from out of left range`)
	assert.ok(symbolNamesOutOfEnd.length === 0, `Can't find definition from out of left range`)

	return symbolNamesOfStart
}

export function searchHTMLDocument([start, selector, end]: [string, string, string]): {in: vscode.Range, out: vscode.Range} | null {
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
		return null
	}

	return {
		in: matchRange!,
		out: outerRange!
	}
}

async function getDefinitionSymbolName(position: vscode.Position): Promise<string[]> {
	let locations = <vscode.Location[]>await vscode.commands.executeCommand('vscode.executeDefinitionProvider', htmlDocument.uri, position)
	let symbolNames = []

	for (let location of locations) {
		symbolNames.push(await getSymbolNameFromLocation(location))
	}

	return symbolNames
}

async function getSymbolNameFromLocation(location: vscode.Location): Promise<string> {
	let cssDocument = await vscode.workspace.openTextDocument(location.uri)
	let text = cssDocument.getText()
 	return text.slice(cssDocument.offsetAt(location.range.start), cssDocument.offsetAt(location.range.end)).replace(/\s*\{[\s\S]+/, '')
}

export async function searchWorkspaceSymbolNames(query: string): Promise<string[]> {
	let symbols = <vscode.SymbolInformation[]>await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)
	let symbolNames = symbols.map(symbol => symbol.name)

	return symbolNames
}
