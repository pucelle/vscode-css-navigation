import {LocationLink, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {URI} from 'vscode-uri'
import * as path from 'path'
import * as fs from 'fs-extra'
import {getPathExtension, isRelativePath} from '../../utils'
import {Part, PartConvertor} from '../parts'
import * as url from 'node:url'


export namespace PathResolver {

	/** Resolve relative path, will search `node_modules` directory to find final import path. */
	export async function resolveModulePath(fromPath: string, toPath: string): Promise<string | null> {
		let isModulePath = toPath.startsWith('~')
		let fromDir = path.dirname(fromPath)
		let beModuleImport = false

		// `~modulename/...`
		if (isModulePath) {
			toPath = toPath.slice(1)
			toPath = fixPathExtension(toPath, fromPath)
			toPath = 'node_modules/' + toPath
			beModuleImport = true
		}
		else {
			toPath = fixPathExtension(toPath, fromPath)

			// Import relative path.
			let filePath = path.resolve(fromDir, toPath)
			if (await fs.pathExists(filePath) && (await fs.stat(filePath)).isFile()) {
				return filePath
			}

			// .xxx or ../xxx is not module import.
			if (!/^\./.test(toPath)) {
				toPath = 'node_modules/' + toPath
				beModuleImport = true
			}
		}

		if (beModuleImport) {
			while (fromDir) {
				let filePath = path.resolve(fromDir, toPath)
				if (await fs.pathExists(filePath) && (await fs.stat(filePath)).isFile()) {
					return filePath
				}
				
				let dir = path.dirname(fromDir)
				if (dir === fromDir) {
					break
				}

				fromDir = dir
			}
		}

		return null
	}


	/** Fix imported path with extension. */
	function fixPathExtension(toPath: string, fromPath: string): string {
		let fromPathExtension = getPathExtension(fromPath)

		if (fromPathExtension === 'scss') {

			// @import `b` -> `b.scss`
			if (path.extname(toPath) === '') {
				toPath += '.scss'
			}
		}

		// One issue here:
		//   If we rename `b.scss` to `_b.scss` in `node_modules`,
		//   we can't get file changing notification from VSCode,
		//   and we can't reload it from path because nothing changes in it.

		// So we may need to validate if imported paths exist after we got definition results,
		// although we still can't get new contents in `_b.scss`.

		return toPath
	}

	
	/** 
	 * Make a link which lick to current import location.
	 * `part` must be in `Import` type.
	 */
	export async function resolveImportLocationLink(part: Part, fromDocument: TextDocument): Promise<LocationLink | null> {
		let uri = await resolveImportURI(part.escapedText, fromDocument)
		if (!uri) {
			return null
		}

		let targetRange = Range.create(0, 0, 0, 0)
		let selectionRange = targetRange
		let fromRange = PartConvertor.toRange(part, fromDocument)

		return LocationLink.create(uri, targetRange, selectionRange, fromRange)
	}

	
	/** Resolve import path to full uri. */
	export async function resolveImportURI(importPath: string, fromDocument: TextDocument): Promise<string | null> {
		let importProtocol = isRelativePath(importPath) ? '' : URI.parse(importPath).scheme
		if (importProtocol) {
			return importPath
		}

		// File relative, try handle module path.
		let fromURI = URI.parse(fromDocument.uri)
		if (fromURI.scheme === 'file') {
			let fullPath = await resolveModulePath(fromURI.fsPath, importPath)
			if (!fullPath) {
				return null
			}

			return URI.file(fullPath).toString()
		}

		// HTTP relative.
		else {
			return new url.URL(importPath, fromDocument.uri).toString()
		}
	}
}
