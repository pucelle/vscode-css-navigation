import * as path from 'path'
import {runTests} from '@vscode/test-electron'


/**
 * Downloads a VSCode instance and runs the e2e test suite in it.
 * Replaces the deprecated `vscode/bin/test` runner from the old `vscode` package.
 */
async function main() {
	try {
		// The folder containing the extension manifest `package.json`, passed as `--extensionDevelopmentPath`.
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../')

		// The compiled test entry (`index.js` exporting `run`), passed as `--extensionTestsPath`.
		const extensionTestsPath = path.resolve(__dirname, './index')

		// The workspace folder to open while running the tests.
		const testWorkspace = path.resolve(__dirname, '../fixture')

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace],
		})
	}
	catch (err) {
		console.error('Failed to run tests', err)
		process.exit(1)
	}
}

void main()
