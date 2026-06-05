import * as https from 'node:https'
import * as http from 'node:http'
import {URI} from 'vscode-uri'
import {promiseWithResolves} from './promise'


export function fetchAsText(url: string): Promise<string> {
	const protocol = URI.parse(url).scheme
	const {promise, resolve, reject} = promiseWithResolves<string>()

	const req = (protocol === 'https' ? https : http).get(url, (res) => {
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