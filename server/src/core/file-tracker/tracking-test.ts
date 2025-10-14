import * as minimatch from 'minimatch'
import {FileTrackerOptions} from './file-tracker'
import {URI} from 'vscode-uri'
import {GlobPathSharer} from './glob-path-sharer'


export class TrackingTest {

	private includeFileMatcher: minimatch.IMinimatch
	private excludeMatcher: minimatch.IMinimatch | null
	private alwaysIncludeGlobSharer: GlobPathSharer | null

	constructor(options: FileTrackerOptions) {
		this.includeFileMatcher = new minimatch.Minimatch(options.includeFileGlobPattern)
		this.excludeMatcher = options.excludeGlobPattern ? new minimatch.Minimatch(options.excludeGlobPattern) : null
		this.alwaysIncludeGlobSharer = options.alwaysIncludeGlobSharer || null
	}

	/** Returns whether should include path, ignore exclude test. */
	shouldIncludePath(filePath: string): boolean {
		return this.includeFileMatcher.match(filePath)
	}

	/** Returns whether should exclude file or folder path. */
	shouldExcludePath(fsPath: string): boolean {

		// Not always include.
		if (this.alwaysIncludeGlobSharer?.match(fsPath)) {
			return false
		}

		// Be exclude.
		if (this.excludeMatcher && this.excludeMatcher.match(fsPath)) {
			return true
		}

		return false
	}

	/** Returns whether should track uri. */
	shouldTrackURI(uri: string): boolean {
		let parsed = URI.parse(uri)
		if (parsed.scheme === 'file') {
			return this.shouldTrackPath(parsed.fsPath)
		}

		// Always should track http or https uris.
		if (parsed.scheme === 'http' || parsed.scheme === 'https') {
			return true
		}

		return false
	}

	/** Returns whether should track path. */
	shouldTrackPath(filePath: string): boolean {
		if (!this.includeFileMatcher.match(filePath)) {
			return false
		}

		if (this.shouldExcludePath(filePath)) {
			return false
		}

		return true
	}
}