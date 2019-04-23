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
