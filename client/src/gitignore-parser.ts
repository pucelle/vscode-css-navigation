import * as vscode from 'vscode'
import * as fs from 'fs'


export function getGitIgnoreGlobPatterns(workspaceFolder: vscode.WorkspaceFolder): Promise<string[] | null> {
	return new Promise(resolve => {
		fs.readFile(workspaceFolder.uri.fsPath + '/.gitignore', 'utf8', (_err, text) => {
			if (_err) {
				resolve(null)
				return
			}

			let rules = text.split(/\r\n|\r|\n/).filter(line => line && !line.startsWith('#'))
			let patterns = rules.map(rule => {
				rule = rule.trim()

				let isInclude = rule.startsWith('!')
				if (isInclude) {
					rule = rule.slice(1)
				}

				let pattern = parseSingleGitIgnoreRuleToGlobPattern(rule)
				if (isInclude) {
					pattern = '!' + pattern
				}

				return pattern
			})

			resolve(patterns)
		})
	})
}


function parseSingleGitIgnoreRuleToGlobPattern(rule: string): string {
	if (rule.startsWith('/')) {
		rule = rule.slice(1)
	}
	else if (!rule.startsWith('**/')) {
		rule = '**/' + rule
	}

	if (!/\.\w+$/.test(rule)) {
		rule += '/**'
	}

	return rule
}