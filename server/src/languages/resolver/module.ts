import {isCSSLikePath} from '../../helpers'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from './path'


/** Resolve module path or  */
export namespace ModuleResolver {

	/** 
	 * Scan imported CSS module.
	 * By a `ReactImportedCSSModuleName` type of part.
	 */
	export async function resolveReactCSSModuleByName(moduleName: string, document: TextDocument): Promise<string | null> {
		let text = document.getText()
		let modulePath = resolveDefaultImportedPathByVariableName(moduleName, text)
		if (!modulePath) {
			return null
		}

		let fullPath = await PathResolver.resolveDocumentPath(modulePath, document)
		return fullPath
	}

	/** Try resolve `path` by matching `import name from path` after known `name`. */
	function resolveDefaultImportedPathByVariableName(variableName: string, text: string): string | null {
		let re = /import\s+(?=\*\s+as\s+)?(\w+)\s+from\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let name = match[1]
			if (name === variableName) {
				return match[2]
			}
		}

		return null
	}

	
	/** 
	 * Scan imported CSS module.
	 * By a `ReactDefaultCSSModule` type of part.
	 */
	export async function resolveReactDefaultCSSModulePaths(document: TextDocument): Promise<string[]> {
		let text = document.getText()
		let paths: string[] = []

		for (let modulePath of resolveNonNamedImportedPaths(text)) {
			let fullPath = await PathResolver.resolveDocumentPath(modulePath, document)
			if (fullPath) {
				paths.push(fullPath)
			}
		}

		return paths
	}

	/** Resolve `import '....css'`. */
	function* resolveNonNamedImportedPaths(text: string): Iterable<string> {
		let re = /import\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let path = match[1]

			if (isCSSLikePath(path)) {
				yield path
			}
		}
	}
}