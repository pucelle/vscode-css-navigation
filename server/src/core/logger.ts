import {Connection, RemoteConsole} from 'vscode-languageserver'
import {toDecimal} from '../utils'


export namespace Logger {

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
		scopedConsole.info(getTimeMarker() + '⚠️ ' + msg)
	}

	/** Error level message. */
	export function error(msg: any) {
		scopedConsole.info(getTimeMarker() + '❌ ' + String(msg))
	}



	let startTimeMap: Map<string, number> = new Map()

	export function getTimestamp(): number {
		let time = process.hrtime()
		return time[0] * 1000 + time[1] / 1000000
	}

	/** Start a new time counter with specified name. */
	export function timeStart(name: string) {
		startTimeMap.set(name, getTimestamp())
	}

	/** End a time counter with specified name. */
	export function timeEnd(name: string, message: string | null = null) {
		let startTime = startTimeMap.get(name)
		if (startTime === undefined) {
			warn(`Timer "${name}" is not started`)
			return
		}

		startTimeMap.delete(name)
		let timeCost = Math.round(getTimestamp() - startTime!)

		if (message !== null) {
			log('🕒 ' + message + ` in ${timeCost} ms`)
		}
	}


	type ResultsHandler<A extends any[], T> = (...args: A) => Promise<T | null>

	/** Log executed time of a function, which will return a list, or a single item. */
	export function logQuerierExecutedTime<A extends any[], T>(fn: ResultsHandler<[A[0], number], T>, type: string): ResultsHandler<A, T> {
		return async (...args: A) => {
			let startTime = getTimestamp()
			let result: Awaited<T> | null = null

			try {
				result = await fn(args[0], startTime)
			}
			catch (err) {
				error(String(err))
				return null
			}

			let time = toDecimal(getTimestamp() - startTime!, 1)
			
			if (Array.isArray(result)) {
				if (result.length === 0) {
					log(`🔍 No ${type} found, ${time} ms cost`)
				}
				else if (result.length === 1) {
					log(`🔍 1 ${type} found, ${time} ms cost`)
				}
				else {
					log(`🔍 ${result.length} ${type}s found, ${time} ms cost`)
				}
			}
			else {
				if (result) {
					log(`🔍 1 ${type} found, ${time} ms cost`)
				}

				// Too many hover messages.
				else if (type !== 'hover') {
					log(`🔍 No ${type} found, ${time} ms cost`)
				}
			}

			return result
		}
	}
}