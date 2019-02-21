import * as vscode from 'vscode'
import * as path from 'path'
import { CSSNavigationExtension } from '../../out/extension';

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

