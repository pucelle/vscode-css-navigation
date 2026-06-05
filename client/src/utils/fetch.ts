import * as https from 'node:https'
import * as http from 'node:http'
import {URL} from 'node:url'
import {promiseWithResolves} from './promise'


export function fetchAsText(uri: string): Promise<string> {

	// Node URL protocol has `:` in end.
	const protocol = URL.parse(uri)?.protocol
	const {promise, resolve, reject} = promiseWithResolves<string>()

	const req = (protocol === 'https:' ? https : http).get(uri, (res) => {
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