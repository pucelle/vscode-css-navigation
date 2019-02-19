import * as fs from 'fs'


//if a workspace folder contains another, what we need is to return the out most one
export function getOutmostWorkspaceFolderPath(folderPath: string, folderPaths: string[]): string | null {
	let includedInPaths = folderPaths.filter(p => p.startsWith(folderPath))
	includedInPaths.sort((a, b) => a.length - b.length)

	return includedInPaths[0]
}


let htmlLanguages: string[]

export function readHTMLLanguages(packageFilePath: string): Promise<string[]> {
	return new Promise(resolve => {
		if (htmlLanguages) {
			resolve(htmlLanguages)
		}
		else {
			fs.readFile(packageFilePath, 'utf8', (err, text) => {
				htmlLanguages = JSON.parse(text).activationEvents.map((s: string) => {
					return s.replace('onLanguage:', '')
				})
				resolve(htmlLanguages)
			})
		}
	})
}