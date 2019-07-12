import * as fs from 'fs'
import * as path from 'path'
import minimatch = require('minimatch')
const ignoreWalk = require('ignore-walk')


export function readText(fsPath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		fs.readFile(fsPath, 'utf8', (err, text) => {
			if (err) {
				reject(err)
			}
			else {
				resolve(text)
			}
		})
	})
}

export function stat(fsPath: string): Promise<fs.Stats | null> {
	return new Promise((resolve) => {
		fs.stat(fsPath, (err, stat) => {
			if (err) {
				resolve(null)
			}
			else {
				resolve(stat)
			}
		})
	})
}

export function fileExists(fsPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		fs.stat(fsPath, (err, stat) => {
			if (err) {
				resolve(false)
			}
			else {
				resolve(stat.isFile())
			}
		})
	})
}


export function generateGlobPatternFromPatterns(patterns: string[]): string | undefined {
	if (patterns.length > 1) {
		return '{' + patterns.join(',') + '}'
	}
	else if (patterns.length === 1) {
		return patterns[0]
	}
	return undefined
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


export function getExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}

export function replaceExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}


// Will return the normalized full file path, only file paths, not include folder paths.
export async function getFilePathsMathGlobPattern(folderPath: string, includeMatcher: minimatch.IMinimatch, excludeMatcher: minimatch.IMinimatch | null): Promise<string[]> {
	let filePaths = await ignoreWalk({
		path: folderPath,
		ignoreFiles: ['.gitignore', '.npmignore'],
		includeEmpty: false, // true to include empty dirs, default false
		follow: false // true to follow symlink dirs, default false
	})

	let matchedFilePaths: string[] = []

	for (let filePath of filePaths) {
		let absoluteFilePath = path.join(folderPath, filePath)
		if (includeMatcher.match(filePath) && (!excludeMatcher || !excludeMatcher.match(absoluteFilePath))) {
			matchedFilePaths.push(absoluteFilePath)
		}
	}

	return matchedFilePaths
}


export async function resolveImportPath(fromPath: string, toPath: string): Promise<string | null> {
	let isModulePath = toPath.startsWith('~')
	let fromDir = path.dirname(fromPath)
	let fromPathExtension = path.extname(fromPath).slice(1).toLowerCase()

	if (isModulePath) {
		while (fromDir) {
			let filePath = await resolvePath(path.resolve(fromDir, 'node_modules/' + toPath.slice(1)), fromPathExtension)
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
		return await resolvePath(path.resolve(fromDir, toPath), fromPathExtension)
	}
}


async function resolvePath(filePath: string, fromPathExtension: string): Promise<string | null> {
	if (await fileExists(filePath)) {
		return filePath
	}

	if (fromPathExtension === 'scss') {
		// @import `b` -> `b.scss`
		if (path.extname(filePath) === '') {
			filePath += '.scss'

			if (await fileExists(filePath)) {
				return filePath
			}
		}

		// @import `b.scss` -> `_b.scss`
		if (path.basename(filePath)[0] !== '_') {
			filePath = path.join(path.dirname(filePath), '_' + path.basename(filePath))

			if (await fileExists(filePath)) {
				return filePath
			}
		}
	}

	// One issue here:
	//   If we rename `b.scss` to `_b.scss` in `node_modules`,
	//   we can't get file changing notification from VSCode,
	//   and we can't reload it from path because nothing changes in it.

	// So we need to validate if import paths exist after we got definition results.
	// Although we still can't get results in `_b.scss`.
	// TODO

	return null
}