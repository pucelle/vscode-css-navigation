import * as https from 'node:https'
import * as http from 'node:http'
import {URL} from 'node:url'
import {promiseWithResolves} from './promise'


export function fetchAsText(uri: string): Promise<string> {

	// Node URL protocol has `:` in end.
	let protocol = URL.parse(uri)?.protocol
	let {promise, resolve, reject} = promiseWithResolves<string>()

	let req = (protocol === 'https:' ? https : http).get(uri, (res) => {
		let data = ''
		
		res.on('data', (chunk) => {
			data += chunk
		})
		
		res.on('end', () => {
			resolve(data)
		})
	})

	req.on('error', (error) => {
		reject(error)
	})

	return promise
}