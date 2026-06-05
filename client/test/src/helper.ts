import * as path from 'path'
import * as assert from 'assert'
import * as vscode from 'vscode'

interface ExtensionExport {
	channel: vscode.OutputChannel
}


export function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export let htmlDocument: vscode.TextDocument
export let cssDocument: vscode.TextDocument
export let jsxDocument: vscode.TextDocument
export let vueDocument: vscode.TextDocument

export async function prepare() {
	if (htmlDocument) {
		return htmlDocument
	}

	//wait for client to start
	await sleep(500)
	const extension = await getExtensionExport()
	extension.channel.show()

	htmlDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('index.html'))
	await vscode.window.showTextDocument(htmlDocument)
	await vscode.commands.executeCommand('workbench.action.keepEditor')

	jsxDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('index.jsx'))
	await vscode.window.showTextDocument(htmlDocument)
	await vscode.commands.executeCommand('workbench.action.keepEditor')

	vueDocument = await vscode.workspace.openTextDocument(getFixtureFileUri('index.vue'))
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

async function getExtensionExport(): Promise<ExtensionExport> {
	const ext = vscode.extensions.getExtension<ExtensionExport>('pucelle.vscode-css-navigation')!
	await ext.activate()
	return ext.exports
}



export async function searchSymbolNames([start, selector, end]: [string, string, string], document: vscode.TextDocument = htmlDocument): Promise<string[] | null> {
	const ranges = searchDocumentForContent([start, selector, end], document)
	const searchText = start + selector + end

	if (!ranges) {
		assert.fail(`Can't find "${searchText}" in index.html`)
	}

	const namesOfStart = await getSymbolNamesAtPosition(ranges.in.start, document)
	const namesOfEnd = await getSymbolNamesAtPosition(ranges.in.end, document)

	assert.deepStrictEqual(namesOfStart, namesOfEnd, 'Can find same definition from start and end position')

	// Comment these because it's not right since there may be definitions for other languages exist.
	// let namesOutOfStart = await getSymbolNamesAtPosition(ranges.out.start, document)
	// let namesOutOfEnd = await getSymbolNamesAtPosition(ranges.out.end, document)

	// assert.ok(namesOutOfStart.length === 0, `Can't find definition from out of left range`)
	// assert.ok(namesOutOfEnd.length === 0, `Can't find definition from out of left range`)

	return namesOfStart
}

function searchDocumentForContent([start, content, end]: [string, string, string], document: vscode.TextDocument):
	{in: vscode.Range, out: vscode.Range} | null
{
	const searchWord = start + content + end
	let matchRange: vscode.Range | undefined
	let outerRange: vscode.Range | undefined

	for (let i = 0; i < document.lineCount; i++) {
		const line = document.lineAt(i)
		const index = line.text.indexOf(searchWord)
		if (index > -1) {
			matchRange = new vscode.Range(
				new vscode.Position(i, index + start.length),
				new vscode.Position(i, index + start.length + content.length)
			)
			outerRange = new vscode.Range(
				document.positionAt(document.offsetAt(matchRange.start) - 1),
				document.positionAt(document.offsetAt(matchRange.end) + 1),
			)
			break
		}
	}

	if (!matchRange || !outerRange) {
		return null
	}

	return {
		in: matchRange,
		out: outerRange
	}
}

async function getSymbolNamesAtPosition(position: vscode.Position, document: vscode.TextDocument): Promise<string[]> {
	const locations = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', document.uri, position)
	const symbolNames = []

	for (const location of locations) {
		if (location && location.range) {
			symbolNames.push(await getCodePieceFromLocation(location))
		}
	}

	return symbolNames
}

async function getCodePieceFromLocation(location: vscode.Location): Promise<string> {
	const document = await vscode.workspace.openTextDocument(location.uri)
	const text = document.getText()
 	return text.slice(document.offsetAt(location.range.start), document.offsetAt(location.range.end)).replace(/\s*\{[\s\S]+|\r?\n[\s\S]+/, '')
}



export async function searchWorkspaceSymbolNames(query: string): Promise<string[]> {
	const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', query)
	const symbolNames = symbols.map(symbol => symbol.name)

	return symbolNames
}



export async function searchReferences(searchWord: string, document: vscode.TextDocument = cssDocument): Promise<string[] | null> {
	const ranges = searchDocumentForContent(['', searchWord, ''], document)
	if (!ranges) {
		assert.fail(`Can't find "${searchWord}" in ${path.basename(document.uri.toString())}`)
	}

	const namesOfStart = await getReferenceNamesAtPosition(ranges.in.start, document)
	const namesOfEnd = await getReferenceNamesAtPosition(ranges.in.end, document)

	// Vscode References has some additional process, which will cause reference range changes.
	if (namesOfStart.length !== namesOfEnd.length) {
		assert.deepStrictEqual(namesOfStart, namesOfEnd, 'Can find same references from start and end position')
	}

	const namesOutOfStart = await getReferenceNamesAtPosition(ranges.out.start, document)
	const namesOutOfEnd = await getReferenceNamesAtPosition(ranges.out.end, document)

	assert.ok(namesOutOfStart.length === 0, `Wrongly find reference from out of left range`)
	assert.ok(namesOutOfEnd.length === 0, `Wrongly find reference from out of right range`)

	return namesOfStart
}

async function getReferenceNamesAtPosition(position: vscode.Position, document: vscode.TextDocument): Promise<string[]> {
	const locations = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', document.uri, position)
	const referenceNames = []

	for (const location of locations) {
		if (location.uri.toString().endsWith('.html')) {
			const codePiece = await getCodePieceFromLocation(location)
			referenceNames.push(codePiece)
		}
	}

	return referenceNames
}



export async function searchCompletion([start, selector, end]: [string, string, string], document: vscode.TextDocument = htmlDocument): Promise<string[] | null> {
	const searchText = start + selector + end
	const ranges = searchDocumentForContent([start, selector, end], document)
	if (!ranges) {
		assert.fail(`Can't find "${searchText}" in ${path.basename(document.uri.toString())}`)
	}

	const namesOfEnd = await getCompletionNamesAtPosition(ranges.in.end)
	return namesOfEnd
}

async function getCompletionNamesAtPosition(position: vscode.Position): Promise<string[]> {
	const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', htmlDocument.uri, position)
	const completionNames = []

	for (const item of list.items) {
		completionNames.push(typeof item.label === 'string' ? item.label : item.label.label)
	}

	return completionNames
}
