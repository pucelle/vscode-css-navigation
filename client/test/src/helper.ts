import * as path from 'path'
import * as vscode from 'vscode'
import {CSSNavigationExtension} from '../../out/extension';

export let doc: vscode.TextDocument
export let editor: vscode.TextEditor

export async function activateExtension(uri: vscode.Uri): Promise<CSSNavigationExtension> {
	let ext = vscode.extensions.getExtension('pucelle.vscode-css-navigation')!
	await ext.activate()
	return ext.exports
}

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export function getFixtureFileUri(relativePath: string): vscode.Uri {
	return vscode.Uri.file(path.resolve(__dirname, '../fixture', relativePath))
}

interface InOutRange{
	in: vscode.Range
	out: vscode.Range
}

export function searchHTMLDocument(document: vscode.TextDocument, [start, selector, end]: [string, string, string]): InOutRange | null {
	let searchWord = start + selector + end
	let matchRange: vscode.Range | null = null
	let outerRange: vscode.Range | null = null

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

export async function getDefinitionSymbolName(htmlDocument: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
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

export async function getWorkspaceSymbolNames(query: string): Promise<string[]> {
	let symbols = <vscode.SymbolInformation[]>await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)
	let symbolNames = symbols.map(symbol => symbol.name)

	return symbolNames
}
