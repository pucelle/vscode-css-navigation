import {isCSSLikePath} from '../../utils'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from './path'
import {findCSSModuleImportPath} from '../css-modules'


/** Resolve module path. */
export namespace ModuleResolver {

	/** 
	 * Scan imported CSS module.
	 * By a `ReactImportedCSSModuleName` type of part.
	 */
	export async function resolveReactCSSModuleURIByName(moduleName: string, document: TextDocument): Promise<string | null> {
		const text = document.getText()
		const modulePath = findCSSModuleImportPath(text, moduleName)
		if (!modulePath) {
			return null
		}

		const uri = await PathResolver.resolveImportURI(modulePath, document)
		return uri
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
