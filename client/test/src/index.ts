import * as path from 'path'
import * as fs from 'fs'
import Mocha from 'mocha'


/**
 * Entry point loaded by `@vscode/test-electron` inside the Extension Host.
 * Replaces the deprecated `vscode/lib/testrunner` from the old `vscode` package.
 */
export function run(): Promise<void> {
	let mocha = new Mocha({
		ui: 'bdd',
		color: true,
		timeout: 100000,
	})

	let testsRoot = __dirname

	return new Promise((resolve, reject) => {
		try {
			let files = fs.readdirSync(testsRoot).filter(file => file.endsWith('.test.js'))
			for (let file of files) {
				mocha.addFile(path.resolve(testsRoot, file))
			}

			mocha.run(failures => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`))
				}
				else {
					resolve()
				}
			})
		}
		catch (err) {
			reject(err)
		}
	})
}
