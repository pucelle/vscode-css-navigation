import * as path from 'path'
import * as fs from 'fs'
import Mocha from 'mocha'


/**
 * Entry point loaded by `@vscode/test-electron` inside the Extension Host.
 * Replaces the deprecated `vscode/lib/testrunner` from the old `vscode` package.
 */
export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
		timeout: 100000,
	})

	const testsRoot = __dirname

	return new Promise((resolve, reject) => {
		try {
			const files = fs.readdirSync(testsRoot).filter(file => file.endsWith('.test.js'))
			for (const file of files) {
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
			reject(err instanceof Error ? err : new Error(String(err)))
		}
	})
}
