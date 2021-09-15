import * as path from 'path'
import minimatch = require('minimatch')
import {Ignore} from './file-tracker'
import * as fs from 'fs-extra'
const ignoreWalk = require('@pucelle/ignore-walk')


export function generateGlobPatternFromPatterns(patterns: string[]): string | null {
	if (patterns.length > 1) {
		return '{' + patterns.join(',') + '}'
	}
	else if (patterns.length === 1) {
		return patterns[0]
	}

	return null
}

export function generateGlobPatternFromExtensions(extensions: string[]): string | null {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}

	return null
}


export function getPathExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}

export function replacePathExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}


/** Will return the normalized full file path, not include folder paths. */
export async function walkDirectoryToMatchFiles(
	folderPath: string,
	includeMatcher: minimatch.IMinimatch,
	excludeMatcher: minimatch.IMinimatch | null,
	ignoreFilesBy: Ignore[]
): Promise<string[]> {
	let filePaths = await ignoreWalk({
		path: folderPath,
		ignoreFiles: ignoreFilesBy,
		includeEmpty: false, // `true` to include empty dirs, default `false`.
		follow: false, // `true` to follow symlink dirs, default `false`
	})

	let matchedFilePaths: Set<string> = new Set()

	for (let filePath of filePaths) {
		let absoluteFilePath = path.join(folderPath, filePath)
		if (includeMatcher.match(filePath) && (!excludeMatcher || !excludeMatcher.match(absoluteFilePath))) {
			matchedFilePaths.add(absoluteFilePath)
		}
	}

	return [...matchedFilePaths]
}


/** Resolve import path, will search `node_modules` directory to find final import path. */
export async function resolveImportPath(fromPath: string, toPath: string): Promise<string | null> {
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
		if (await fs.pathExists(filePath)) {
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
			if (await fs.pathExists(filePath)) {
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