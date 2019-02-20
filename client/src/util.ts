import * as fs from 'fs'


//if a workspace folder contains another, what we need is to return the out most one
export function getOutmostWorkspaceFolderPath(folderPath: string, folderPaths: string[]): string | null {
	let includedInPaths = folderPaths.filter(p => p.startsWith(folderPath))
	includedInPaths.sort((a, b) => a.length - b.length)

	return includedInPaths[0]
}
