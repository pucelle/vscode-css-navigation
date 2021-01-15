import {Connection, RemoteConsole} from 'vscode-languageserver'


let scopedConsole: Console | RemoteConsole = console
let logEnabled = true


/** Get a time marker `hh:MM:ss` for current time. */
function getTimeMarker() {
	let date = new Date()
	
	return '['
		+ String(date.getHours())
		+ ':'
		+ String(date.getMinutes()).padStart(2, '0')
		+ ':'
		+ String(date.getSeconds()).padStart(2, '0')
		+ '] '
}



/** 
 * Pipe messages to connection, such that all messages will be shown in output channel.
 * After tested I found just using `console.xxx` can also output messages,
 * so this piping should be useless anymore, may be removed after checking it carefully.
 */
export function pipeTo(connection: Connection) {
	scopedConsole = connection.console
}

/** Enables or disables log level message, that means, not important messages. */
export function setLogEnabled(enabled: boolean) {
	logEnabled = enabled
}



/** Log level message. */
export function log(msg: string) {
	if (logEnabled) {
		scopedConsole.log(getTimeMarker() + msg)
	}
}

/** Info level message. */
export function info(msg: string) {
	scopedConsole.info(getTimeMarker() + msg)
}

/** Warn level message. */
export function warn(msg: string) {
	scopedConsole.warn(getTimeMarker() + msg)
}

/** Error level message. */
export function error(msg: string | Error) {
	scopedConsole.error(String(msg))
}



let startTimeMap: Map<string, number> = new Map()

function getMillisecond(): number {
	let time = process.hrtime()
	return time[0] * 1000 + time[1] / 1000000
}

/** Start a new time counter with specified name. */
export function timeStart(name: string) {
	startTimeMap.set(name, getMillisecond())
}

/** End a time counter with specified name. */
export function timeEnd(name: string, message: string | null = null) {
	let startTime = startTimeMap.get(name)
	if (startTime === undefined) {
		warn(`Timer "${name}" is not started`)
		return
	}

	startTimeMap.delete(name)
	let timeCost = Math.round(getMillisecond() - startTime!)

	if (message !== null) {
		log(message + ` in ${timeCost} ms`)
	}
}



type ResultsHandler<A extends any[], T> = (...args: A) => Promise<T[] | null>

/** Log executed time of a function, which will return a list. */
export function logListQuerierExecutedTime<A extends any[], T>(fn: ResultsHandler<A, T>, type: string): ResultsHandler<A, T> {
	return async (...args: A) => {
		let startTime = getMillisecond()
		let list = await fn(...args)
		let time = Math.round(getMillisecond() - startTime!)
		
		if (list) {
			if (list.length === 0) {
				log(`No ${type} found, ${time} ms cost`)
			}
			else if (list.length === 1) {
				log(`1 ${type} found, ${time} ms cost`)
			}
			else {
				log(`${list.length} ${type}s found, ${time} ms cost`)
			}
		}

		return list
	}
}