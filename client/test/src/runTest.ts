import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import {runTests} from '@vscode/test-electron'


/**
 * Downloads a VSCode instance and runs the e2e test suite in it.
 * Replaces the deprecated `vscode/bin/test` runner from the old `vscode` package.
 */
async function main() {
	let failed = false
	let userDataDir: string | undefined

	try {
		// The folder containing the extension manifest `package.json`, passed as `--extensionDevelopmentPath`.
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../')

		// The compiled test entry (`index.js` exporting `run`), passed as `--extensionTestsPath`.
		const extensionTestsPath = path.resolve(__dirname, './index')

		// The workspace folder to open while running the tests.
		const testWorkspace = path.resolve(__dirname, '../fixture')

		// Keep the VS Code IPC socket path short on macOS; long checkout paths can exceed its limit.
		userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-nav-'))

		// `VSCODE_VERSION` lets CI pin the VSCode build to test against (e.g. the oldest
		// supported `1.91.0` and the latest `stable`); defaults to `stable` locally.
		await runTests({
			version: process.env.VSCODE_VERSION || 'stable',
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [`--user-data-dir=${userDataDir}`, testWorkspace],
		})
	}
	catch (err) {
		console.error('Failed to run tests', err)
		failed = true
	}
	finally {
		if (userDataDir) {
			await fs.rm(userDataDir, {recursive: true, force: true})
		}
	}

	if (failed) {
		process.exit(1)
	}
}

void main()
