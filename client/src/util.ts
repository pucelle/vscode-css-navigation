//if a workspace folder contains another, what we need is to return the out most one
export function getOutmostWorkspaceURI(folderURI: string, folderURIs: string[]): string | null {
	let includedInURIs = folderURIs.filter(p => p.startsWith(folderURI))
	includedInURIs.sort((a, b) => a.length - b.length)

	return includedInURIs[0]
}
