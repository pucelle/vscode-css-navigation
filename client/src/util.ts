import * as path from 'path'


/** If a workspace folder contains another, what we need is to return the outmost one. */
export function getOutmostWorkspaceURI(folderURI: string, allFolderURIs: string[]): string | null {
	let parentURIs = allFolderURIs.filter(parentURI => folderURI.startsWith(parentURI + '/'))
	parentURIs.sort((a, b) => a.length - b.length)

	return parentURIs[0] || folderURI
}


/** Get path extension in lowercase, without dot. */
export function getPathExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}


/** Generate a glob pattern from file extension list. */
export function generateGlobPatternFromExtensions(extensions: string[]): string | undefined {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}

	return undefined
}


/** Generate current time marker in `h:MM:ss` format. */
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
