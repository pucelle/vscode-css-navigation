import * as path from 'path'
import minimatch = require('minimatch')
import {Ignore} from './file-tracker'
import * as fs from 'fs-extra'
const ignoreWalk = require('ignore-walk')



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
	let fromPathExtension = getPathExtension(fromPath)

	// `~modulename/...`
	if (isModulePath) {
		while (fromDir) {
			let filePath = await fixPathExtension(path.resolve(fromDir, 'node_modules/' + toPath.slice(1)), fromPathExtension)
			if (filePath) {
				return filePath
			}
			let dir = path.dirname(fromDir)
			if (dir === fromDir) {
				break
			}
			fromDir = dir
		}

		return null
	}
	else {
		return await fixPathExtension(path.resolve(fromDir, toPath), fromPathExtension)
	}
}


/** Fix imported path with extension. */
async function fixPathExtension(filePath: string, fromPathExtension: string): Promise<string | null> {
	let extension = getPathExtension(filePath)
	if (extension && await fs.pathExists(filePath)) {
		return filePath
	}

	if (fromPathExtension === 'scss') {
		// @import `b` -> `b.scss`
		if (path.extname(filePath) === '') {
			filePath += '.scss'

			if (await fs.pathExists(filePath)) {
				return filePath
			}
		}

		// @import `b.scss` -> `_b.scss`
		if (path.basename(filePath)[0] !== '_') {
			filePath = path.join(path.dirname(filePath), '_' + path.basename(filePath))

			if (await fs.pathExists(filePath)) {
				return filePath
			}
		}
	}

	// One issue here:
	//   If we rename `b.scss` to `_b.scss` in `node_modules`,
	//   we can't get file changing notification from VSCode,
	//   and we can't reload it from path because nothing changes in it.

	// So we may need to validate if imported paths exist after we got definition results,
	// although we still can't get new contents in `_b.scss`.

	return null
}