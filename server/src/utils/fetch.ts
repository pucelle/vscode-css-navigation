import * as https from 'node:https'
import * as http from 'node:http'
import {URI} from 'vscode-uri'
import {promiseWithResolves} from './promise'


export function fetchAsText(url: string): Promise<string> {
	let protocol = URI.parse(url).scheme
	let {promise, resolve, reject} = promiseWithResolves<string>()

	let req = (protocol === 'https' ? https : http).get(url, (res) => {
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