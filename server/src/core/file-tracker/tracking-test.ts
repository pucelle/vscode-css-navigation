import * as minimatch from 'minimatch'
import {FileTrackerOptions} from './file-tracker'
import {URI} from 'vscode-uri'


export class TrackingTest {

	private includeFileMatcher: minimatch.IMinimatch
	private excludeMatcher: minimatch.IMinimatch | null
	private alwaysIncludeMatcher: minimatch.IMinimatch | null

	constructor(options: FileTrackerOptions) {
		let alwaysIncludeGlobPattern = options.alwaysIncludeGlobPattern || null
		this.includeFileMatcher = new minimatch.Minimatch(options.includeFileGlobPattern)
		this.excludeMatcher = options.excludeGlobPattern ? new minimatch.Minimatch(options.excludeGlobPattern) : null
		this.alwaysIncludeMatcher = alwaysIncludeGlobPattern ? new minimatch.Minimatch(alwaysIncludeGlobPattern) : null
	}

	/** Returns whether should include file, ignore exclude test. */
	shouldIncludeFile(filePath: string): boolean {
		return this.includeFileMatcher.match(filePath)
	}

	/** Returns whether should track uri. */
	shouldTrackURI(uri: string): boolean {
		let fsPath = URI.parse(uri).fsPath

		if (!this.includeFileMatcher.match(fsPath)) {
			return false
		}

		if (this.shouldExcludeFileOrFolder(fsPath)) {
			return false
		}

		return true
	}

	/** Returns whether should track file. */
	shouldTrackFile(filePath: string): boolean {
		if (!this.includeFileMatcher.match(filePath)) {
			return false
		}

		if (this.shouldExcludeFileOrFolder(filePath)) {
			return false
		}

		return true
	}

	/** Returns whether should exclude file or folder. */
	shouldExcludeFileOrFolder(fsPath: string) {

		// Not always include.
		if (this.alwaysIncludeMatcher && this.alwaysIncludeMatcher.match(fsPath)) {
			return false
		}

		// Be exclude.
		if (this.excludeMatcher && this.excludeMatcher.match(fsPath)) {
			return true
		}

		return false
	}

}