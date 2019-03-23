import * as path from 'path'


//if a workspace folder contains another, what we need is to return the out most one
export function getOutmostWorkspaceURI(folderURI: string, folderURIs: string[]): string | null {
	let includedInURIs = folderURIs.filter(shorterURI => folderURI.startsWith(shorterURI))
	includedInURIs.sort((a, b) => a.length - b.length)

	return includedInURIs[0]
}

export function getExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}

export function generateGlobPatternFromExtensions(extensions: string[]): string | undefined {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}

	return undefined
}

export function getTimeMarker() {
	let date = new Date()
	
	return '['
		+ String(date.getHours())
		+ ':'
		+ String(date.getMinutes()).padStart(2, '0')
		+ ':'
		+ String(date.getSeconds()).padStart(2, '0')
		+ '] '
}

export function unique<T>(array: T[]): T[] {
	let set: Set<T> = new Set(array)
	return [...set.values()]
}