import * as fs from 'fs'
import * as path from 'path'
import * as rawGlob from 'glob'
import {Connection} from 'vscode-languageserver'


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

export function pipeTimedConsoleToConnection(connection: Connection) {
	global.console.log = (msg: string | Error) => {
		let date = new Date()
		let dateString =
			String(date.getHours()).padStart(2, '0')
			+ ':'
			+  String(date.getMinutes()).padStart(2, '0')
			+ ':'
			+  String(date.getSeconds()).padStart(2, '0')
	
		connection.console.log(dateString + ' ' + msg)
	}
}

export namespace timer {
	let startTimeMap: Map<string, number> = new Map()

	export function getMillisecond(): number {
		let time = process.hrtime()
		return time[0] * 1000 + time[1] / 1000000
	}

	export function start(name: string) {
		startTimeMap.set(name, getMillisecond())
	}

	export function end(name: string): number {
		let startTime = startTimeMap.get(name)
		if (startTime === undefined) {
			throw new Error('Timer "${name}" is not started')
		}

		return Math.round(getMillisecond() - startTime!)
	}


	type resultsHandler<A extends any[], T> = (...args: A) => Promise<T[] | null>

	export function logListReturnedFunctionExecutedTime<A extends any[], T>(fn: resultsHandler<A, T>, type: string): resultsHandler<A, T> {
		return async (...args: A) => {
			let startTime = getMillisecond()
			let list = await fn(...args)
			let time = Math.round(getMillisecond() - startTime!)

			if (!list || list.length === 0) {
				console.log(`No ${type} found, ${time} millisecond${time > 1 ? 's' : ''} spent`)
			}
			else if (list.length === 1) {
				console.log(`1 ${type} found, ${time} millisecond${time > 1 ? 's' : ''} spent`)
			}
			else {
				console.log(`${list.length} ${type}s found, ${time} millisecond${time > 1 ? 's' : ''} spent`)
			}

			return list
		}
	}
}