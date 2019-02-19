import * as fs from 'fs'
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

export function getStat(fsPath: string): Promise<fs.Stats> {
	return new Promise((resolve, reject) => {
		fs.stat(fsPath, (err, stat) => {
			if (err) {
				reject(err)
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
