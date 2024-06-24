import * as fs from 'fs-extra'
import * as path from 'path'
import {IMinimatch, Minimatch} from 'minimatch'


export interface FileWalkerOptions {

	/** Current working directory, default value is `CWD`. */
	currentDir?: string

	/** Ignores file names, default value is `.gitignore`. */
	ignoreFileNames?: string[]

	/** Whether follow symbol links, default value is `false`. */
	followSymbolLinks: boolean
}


interface IgnoreRule {
	relDir: string
	match: IMinimatch
}


/** Can only read at most 1000 files. */
const ReadFileCountLimit = 1000


class FileWalker {

	/** Current working directory, default value is `CWD`. */
	private currentDir: string

	/** Ignores file names, default value is `.gitignore`. */
	private ignoreFileNames: string[]

	/** Whether follow symbol links. */
	private followSymbolLinks: boolean

	constructor (options: FileWalkerOptions) {
		this.currentDir = options.currentDir ?? process.cwd()
		this.ignoreFileNames = options.ignoreFileNames || [ '.gitignore' ]
		this.followSymbolLinks = options.followSymbolLinks ?? false
	}

	/** Generate relative paths relative to current directory. */
	async *walk(): AsyncGenerator<string> {
		let count: {value: number} = {value: 0}

		for await(let relPath of this.walkRecursively('', [], count)) {
			yield relPath
		}
	}

	private async *walkRecursively(relDir: string, ignoreRules: IgnoreRule[], count: {value: number}): AsyncGenerator<string> {
		let fileNames = await fs.readdir(path.join(this.currentDir, relDir))

		for (let fileName of fileNames) {
			if (this.isIgnoreFile(fileName)) {

				// Must regenerate array.
				ignoreRules = [...ignoreRules, ...await this.parseIgnoreRules(relDir, fileName)]
			}
		}

		// May parallel to increase speed, but will break generator logic.
		for (let fileName of fileNames) {
			if (fileName.startsWith('.')) {
				continue
			}

			let relPath = path.join(relDir, fileName)
			let stat = await this.readStat(relPath)

			if (this.matchIgnoreRules(relPath, ignoreRules)) {
				continue
			}

			if (stat.isDirectory()) {
				for await(let subRelPath of this.walkRecursively(relPath, ignoreRules, count)) {
					yield subRelPath
				}
			}
			else {
				yield relPath
				count.value++

				if (count.value > ReadFileCountLimit) {
					break
				}
			}
		}
	}

	private isIgnoreFile(name: string) {
		return this.ignoreFileNames.includes(name)
	}

	private async readStat(relPath: string): Promise<fs.Stats> {
		let absPath = path.join(this.currentDir, relPath)
		return this.followSymbolLinks ? await fs.stat(absPath) : await fs.lstat(absPath)
	}

	private async parseIgnoreRules(relDir: string, fileName: string): Promise<IgnoreRule[]> {
		let absPath = path.join(this.currentDir, relDir, fileName)
		let text = await fs.readFile(absPath, 'utf8')

		let globOptions = {
			matchBase: true,
			dot: true,
			flipNegate: true,
			nocase: true
		}

		let ruleLines = text.split(/\r?\n/)
			.filter(line => !/^#|^$/.test(line.trim()))

		// Here it doesn't supports expressions like `!XXX`.
		let rules = ruleLines.map(pattern => {
			if (pattern.startsWith('/')) {
				pattern = pattern.slice(1)
			}
			else {
				pattern = '{**/,}' + pattern
			}

			if (pattern.endsWith('/')) {
				pattern = pattern.replace(/\/$/, '{/**,}')
			}
			
			return {
				relDir,
				match: new Minimatch(pattern, globOptions),
			}
		})
		
		return rules
	}

	private matchIgnoreRules(relPath: string, ignoreRules: IgnoreRule[]) {
		for (let rule of ignoreRules) {
			let pathRelToRule = path.relative(rule.relDir, relPath)

			if (rule.match.match(pathRelToRule)) {
				return true
			}
		}

		return false
	}
}



/** Will walk the file paths, generate each absolute paths, not include folder path. */
export async function* walkDirectoryToMatchFiles(
	currentDir: string,
	ignoreFileNames: string[],
	mostFileCount: number = Infinity
): AsyncGenerator<string> {
	let walker = new FileWalker({
		currentDir,
		ignoreFileNames,
		followSymbolLinks: false,
	})

	let count = 0

	for await(let relPath of walker.walk()) {
		if (count > mostFileCount) {
			break
		}

		yield path.join(currentDir, relPath)
		count++
	}
}

