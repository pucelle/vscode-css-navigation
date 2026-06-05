import {isCSSLikePath} from '../../utils'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from './path'


/** Resolve module path or  */
export namespace ModuleResolver {

	/** 
	 * Scan imported CSS module.
	 * By a `ReactImportedCSSModuleName` type of part.
	 */
	export async function resolveReactCSSModuleURIByName(moduleName: string, document: TextDocument): Promise<string | null> {
		const text = document.getText()
		const modulePath = resolveDefaultImportedPathByVariableName(moduleName, text)
		if (!modulePath) {
			return null
		}

		const uri = await PathResolver.resolveImportURI(modulePath, document)
		return uri
	}

	/** Try resolve `path` by matching `import name from path` after known `name`. */
	function resolveDefaultImportedPathByVariableName(variableName: string, text: string): string | null {
		const re = /import\s+(?=\*\s+as\s+)?(\w+)\s+from\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while ((match = re.exec(text)) !== null) {
			const name = match[1]
			if (name === variableName) {
				return match[2]
			}
		}

		return null
	}

	
	/** 
	 * Scan imported CSS module uris.
	 * By a `ReactDefaultCSSModule` type of part.
	 */
	export async function resolveReactDefaultCSSModuleURIs(document: TextDocument): Promise<string[]> {
		const text = document.getText()
		const uris: string[] = []

		for (const modulePath of resolveNonNamedImportedPaths(text)) {
			const uri = await PathResolver.resolveImportURI(modulePath, document)
			if (uri) {
				uris.push(uri)
			}
		}

		return uris
	}

	/** Resolve `import '....css'`. */
	function* resolveNonNamedImportedPaths(text: string): Iterable<string> {
		const re = /import\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while ((match = re.exec(text)) !== null) {
			const path = match[1]

			if (isCSSLikePath(path)) {
				yield path
			}
		}
	}
}