import * as fs from 'fs'
import * as path from 'path'
import * as rawGlob from 'glob'


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
	return new Promise((resolve, reject) => {
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

export function glob(pattern: string, options: rawGlob.IOptions = {}): Promise<string[]> {
	return new Promise((resolve, reject) => {
		rawGlob(pattern, options, (err, paths) => {
			if (err) {
				reject(err)
			}
			else {
				resolve(paths)
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
}

export function generateGlobPatternFromExtensions(extensions: string[]): string | undefined {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}
}

export function getExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}

export function replaceExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}