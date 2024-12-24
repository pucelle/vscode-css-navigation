import {isCSSLikePath} from '../../helpers'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from './path'


/** Resolve module path or  */
export namespace ModuleResolver {

	/** 
	 * Scan imported CSS module.
	 * By a `ReactImportedCSSModuleName` type of part.
	 */
	export async function resolveReactCSSModule(moduleName: string, document: TextDocument): Promise<string | null> {
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
	export async function resolveReactDefaultCSSModule(document: TextDocument): Promise<string | null> {
		let text = document.getText()
		let modulePath = resolveNonNamedImportedPath(text)
		if (!modulePath) {
			return null
		}

		let fullPath = await PathResolver.resolveDocumentPath(modulePath, document)
		return fullPath
	}

	/** Resolve `import '....css'`. */
	function resolveNonNamedImportedPath(text: string): string | null {
		let re = /import\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			let path = match[1]

			if (isCSSLikePath(path)) {
				return path
			}
		}

		return null
	}
}