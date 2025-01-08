import * as path from 'path'
import * as minimatch from 'minimatch'
import * as fs from 'fs-extra'

import {
	DidChangeWatchedFilesParams,
	FileChangeType,
	TextDocuments,
} from 'vscode-languageserver'

import {TextDocument} from 'vscode-languageserver-textdocument'
import {Logger} from './logger'
import {URI} from 'vscode-uri'
import {walkDirectoryToMatchFiles} from './file-walker'
import {glob} from 'glob'
import {promisify} from 'util'


interface FileTrackerItem {

	/** Related document. */
	document: TextDocument | null

	/** 
	 * Document version.
	 * If is 0, means needs to be updated.
	 */
	version: number

	/** Union of byte mask of `TrackReason`. */
	reason: TrackReasonMask

	/** Latest used time, use it only for imported reason. */
	latestUseTime: number

	/** if file opened, it can capture it's change event. */
	opened: boolean

	/** Is document content fresh. */
	fresh: boolean

	/**
	 * update request may come from track, or beFresh, we cant make sure they will have no conflict
	 * so we need a promise to lock it to avoid two update task are executed simultaneously.
	 */
	updatePromise: Promise<void> | null
}

export enum TrackReasonMask {

	/** Included in workspace and not been ignored. */
	Included = 1,

	/** As opened document. */
	Opened = 2,

	/** As imported document. */
	Imported = 4,
}


/** Specifies whether ignoring files by things specified in these files. */
export type Ignore = '.gitignore' | '.npmignore'

export interface FileTrackerOptions {

	/** Glob pattern of paths of included files. */
	includeFileGlobPattern: string

	/** Glob pattern of paths of  excluded files. */
	excludeGlobPattern?: string

	/** Glob pattern that files matched will always be included even they match `excludeGlobPatterns` or listed in `.gitignore` or `.npmignore`. */
	alwaysIncludeGlobPattern?: string

	/** Ignore files by `.gitignore` or `.npmignore`. */
	ignoreFilesBy?: Ignore[]

	/** Start directory to track files. */
	startPath?: string

	/** Most count of files to track, default value is `Infinity`. */
	mostFileCount?: number

	/** If not use service after some milliseconds, release all resources. */
	releaseTimeoutMs?: number
}

/** Clean long-unused imported only sources every 5mins. */
const CheckImportedTimeInterval =  5 * 60 * 1000


/** Class to track one type of files in a directory. */
export class FileTracker {

	readonly documents: TextDocuments<TextDocument>
	readonly startPath: string | null
	readonly alwaysIncludeGlobPattern: string | null
	readonly ignoreFilesBy: Ignore[]
	readonly mostFileCount: number
	readonly releaseTimeoutMs: number

	protected includeFileMatcher: minimatch.IMinimatch
	protected excludeMatcher: minimatch.IMinimatch | null
	protected alwaysIncludeMatcher: minimatch.IMinimatch | null

	protected map: Map<string, FileTrackerItem> = new Map()
	protected ignoredFileURIs: Set<string> = new Set()
	protected allFresh: boolean = true
	protected startDataLoaded: boolean = true
	protected updating: Promise<void> | null = null
	protected releaseTimeout: NodeJS.Timeout | null = null
	protected releaseImportedTimeout: NodeJS.Timeout | null = null
	protected timestamp: number = 0

	/** May push more promises when updating, so there is a property. */
	protected updatePromises: Promise<void>[] = []

	constructor(documents: TextDocuments<TextDocument>, options: FileTrackerOptions) {
		this.documents = documents
		this.startPath = options.startPath || null
		this.alwaysIncludeGlobPattern = options.alwaysIncludeGlobPattern || null
		this.ignoreFilesBy = options.ignoreFilesBy || []
		this.mostFileCount = options.mostFileCount ?? Infinity
		this.releaseTimeoutMs = options.releaseTimeoutMs ?? Infinity

		this.includeFileMatcher = new minimatch.Minimatch(options.includeFileGlobPattern)
		this.excludeMatcher = options.excludeGlobPattern ? new minimatch.Minimatch(options.excludeGlobPattern) : null
		this.alwaysIncludeMatcher = this.alwaysIncludeGlobPattern ? new minimatch.Minimatch(this.alwaysIncludeGlobPattern) : null

		if (this.startPath) {
			this.allFresh = false
			this.startDataLoaded = false
		}

		// Clean long-unused imported only sources every 5mins.
		setInterval(this.cleanImportedSources, CheckImportedTimeInterval)
	}

	/** Whether tracked file by it's uri. */
	has(uri: string): boolean {
		return this.map.has(uri)
	}

	/** Walk all included or opened uris. */
	*walkIncludedOrOpenedURIs(): Iterable<string> {
		for (let [uri, item] of this.map) {
			if ((item.reason & (TrackReasonMask.Included | TrackReasonMask.Opened)) === 0) {
				continue
			}

			yield uri
		}
	}

	/** Update timestamp. */
	updateTimestamp(time: number) {
		this.timestamp = time
	}

	/** When document opened or content changed from vscode editor. */
	onDocumentOpenOrContentChanged(document: TextDocument) {

		// No need to handle file opening because we have preloaded all the files.
		// Open and changed event will be distinguished by document version later.
		if (this.has(document.uri) || this.shouldTrackFile(URI.parse(document.uri).fsPath)) {
			this.trackOpenedDocument(document)
		}
	}

	/** After document saved. */
	onDocumentSaved(document: TextDocument) {
		let item = this.map.get(document.uri)

		// Since `onDidChangeWatchedFiles` event was triggered so frequently, we only do updating after saved.
		if (item && !item.fresh && this.updating) {
			this.updateFile(document.uri, item)
		}
	}

	/** After document closed. */
	onDocumentClosed(document: TextDocument) {
		if (this.has(document.uri)) {
			this.reTrackClosedFile(document.uri)
		}
	}

	/** After changes of files or folders. */
	async onWatchedFileOrFolderChanged(params: DidChangeWatchedFilesParams) {
		for (let change of params.changes) {
			let uri = change.uri
			let fsPath = URI.parse(uri).fsPath

			// New file or folder.
			if (change.type === FileChangeType.Created) {

				// If haven't loaded whole workspace, no need to load newly created.
				// An issue for `@import ...` resources:
				// It's common that we import resources inside `node_modules`,
				// but we can't get notifications when those files changed.
				if (!this.startDataLoaded) {
					return
				}

				this.tryTrackFileOrFolder(fsPath, TrackReasonMask.Included)
			}

			// Content changed file or folder.
			else if (change.type === FileChangeType.Changed) {
				if (await fs.pathExists(fsPath)) {
					let stat = await fs.stat(fsPath)
					if (stat && stat.isFile()) {
						if (this.shouldTrackFile(fsPath)) {
							this.reTrackChangedFile(uri, TrackReasonMask.Included)
						}
					}
				}
			}

			// Deleted file or folder.
			else if (change.type === FileChangeType.Deleted) {
				this.untrackDeletedFileOrFolder(uri)
			}
		}
	}

	/** Load all files inside `startPath`, and also all opened documents. */
	private async loadStartData() {
		Logger.timeStart('track')

		for (let document of this.documents.all()) {
			if (this.shouldTrackFile(URI.parse(document.uri).fsPath)) {
				this.trackOpenedDocument(document)
			}
		}

		if (this.alwaysIncludeGlobPattern) {
			let alwaysIncludePaths = await promisify(glob)(this.alwaysIncludeGlobPattern, {
				cwd: this.startPath || undefined,
				absolute: true,
			})

			for (let filePath of alwaysIncludePaths) {
				filePath = URI.file(filePath).fsPath

				if (this.shouldTrackFile(filePath)) {
					this.trackFile(filePath, TrackReasonMask.Included)
				}
			}
		}

		await this.tryTrackFileOrFolder(this.startPath!, TrackReasonMask.Included)

		Logger.timeEnd('track', `${this.map.size} files tracked`)
		this.startDataLoaded = true
	}

	/** Returns whether should track one file. */
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
	private shouldExcludeFileOrFolder(fsPath: string) {

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

	/** Track file or folder. */
	private async tryTrackFileOrFolder(fsPath: string, reason: TrackReasonMask) {
		if (this.shouldExcludeFileOrFolder(fsPath)) {
			return
		}

		if (!await fs.pathExists(fsPath)) {
			return
		}

		let stat = await fs.stat(fsPath)
		if (stat.isDirectory()) {
			await this.tryTrackFolder(fsPath, reason)
		}
		else if (stat.isFile()) {
			let filePath = fsPath
			if (this.shouldTrackFile(filePath)) {
				this.trackFile(filePath, reason)
			}
		}
	}
	
	/** Track folder. */
	private async tryTrackFolder(folderPath: string, reason: TrackReasonMask) {
		let filePathsGenerator = walkDirectoryToMatchFiles(folderPath, this.ignoreFilesBy, this.mostFileCount)

		for await (let absPath of filePathsGenerator) {
			if (this.shouldTrackFile(absPath)) {
				this.trackFile(absPath, reason)
			}
		}
	}

	/** Test whether specified uri mapped fs path is included in start path. */
	isURIWithinStartPath(uri: string): boolean {
		if (!this.startPath) {
			return false
		}

		let filePath = URI.parse(uri).fsPath
		return filePath.startsWith(this.startPath)
	}

	/** 
	 * Track more file, normally imported file.
	 * or should be excluded by exclude glob path.
	 */
	trackMoreFile(filePath: string, reason: TrackReasonMask = TrackReasonMask.Imported) {

		// Here not validate `alwaysIncludeMatcher` and `excludeMatcher` here.
		if (this.includeFileMatcher.match(filePath)) {
			this.trackFile(filePath, reason)
		}
	}

	/** Track file, not validate should track here. */
	private trackFile(filePath: string, reason: TrackReasonMask) {
		let uri = URI.file(filePath).toString()
		let item = this.map.get(uri)

		if (item) {
			item.reason |= reason
		}
		else {
			item = {
				document: null,
				version: 0,
				reason,
				latestUseTime: 0,
				opened: false,
				fresh: false,
				updatePromise: null
			}

			this.map.set(uri, item)
			this.afterTrackedFile(uri, item)
		}
	}

	/** Track opened file from document, or update tracking, no matter files inside or outside workspace. */
	trackOpenedDocument(document: TextDocument) {
		let uri = document.uri
		let item = this.map.get(uri)

		if (item) {
			let fileChanged = document.version > item.version
			item.document = document
			item.version = document.version
			item.reason |= TrackReasonMask.Opened
			item.opened = true

			if (fileChanged) {
				this.makeFileExpire(uri, item)
			}
		}
		else {
			item = {
				document,
				version: document.version,
				reason: TrackReasonMask.Opened,
				latestUseTime: 0,
				opened: true,
				fresh: false,
				updatePromise: null
			}

			this.map.set(uri, item)
			this.afterTrackedFile(uri, item)
		}
	}

	/** After knows that file get expired. */
	private makeFileExpire(uri: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(uri, item)
		}
		else {
			let beFreshBefore = item.fresh
			
			item.fresh = false
			item.version = 0
			this.allFresh = false

			if (beFreshBefore) {
				Logger.log(`${decodeURIComponent(uri)} expired`)
			}

			this.onFileExpired(uri)
		}
	}

	/** After tracked file, check if it's fresh, if not, set global fresh state or update it. */
	private afterTrackedFile(uri: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(uri, item)
		}
		else if (item) {
			this.allFresh = false
		}

		Logger.log(`${decodeURIComponent(uri)} tracked`)
		this.onFileTracked(uri)
	}

	/** Ignore file, Still keep data for ignored items. */
	ignore(uri: string) {
		this.ignoredFileURIs.add(uri)
		Logger.log(`${decodeURIComponent(uri)} ignored`)
	}

	/** Stop ignoring file. */
	notIgnore(uri: string) {
		this.ignoredFileURIs.delete(uri)
		Logger.log(`${decodeURIComponent(uri)} restored from ignored`)
	}

	/** Check whether ignored file. */
	hasIgnored(uri: string) {
		return this.ignoredFileURIs.size > 0 && this.ignoredFileURIs.has(uri)
	}

	/** After file content changed, re track it. */
	private reTrackChangedFile(uri: string, reason: TrackReasonMask) {
		let item = this.map.get(uri)
		if (item) {
			// Already been handled by document change event.
			let openedAndFresh = item.document && item.version === item.document.version
			if (!openedAndFresh) {
				this.makeFileExpire(uri, item)
			}
		}
		else {
			this.trackFile(URI.parse(uri).fsPath, reason)
		}
	}

	/** After file get closed, decide whether untrack it. */
	private reTrackClosedFile(uri: string) {
		let item = this.map.get(uri)
		if (!item) {
			return
		}

		item.reason &= ~TrackReasonMask.Opened

		// Still have reason to track it.
		let shouldKeep = item.reason > 0
		if (!shouldKeep) {
			this.untrackFile(uri)
		}
	}

	/** After file or folder deleted from disk. */
	private untrackDeletedFileOrFolder(deletedURI: string) {
		for (let uri of this.map.keys()) {
			if (uri.startsWith(deletedURI)) {
				let item = this.map.get(uri)
				if (item) {
					this.untrackFile(uri)
				}
			}
		}

		this.allFresh = false
	}

	/** Delete one file. */
	private untrackFile(uri: string) {
		this.map.delete(uri)
					
		if (this.ignoredFileURIs.size > 0) {
			this.ignoredFileURIs.delete(uri)
		}
		
		Logger.log(`${decodeURIComponent(uri)} removed`)
		this.onFileUntracked(uri)
	}

	/** Ensure all the content be fresh. */
	async beFresh() {
		if (this.allFresh) {
			return
		}

		if (this.updating) {
			await this.updating
		}
		else {
			this.updating = this.doUpdating()
			await this.updating
			this.updating = null
			this.allFresh = true
		}

		this.mayResetReleaseTimeout()
	}

	/** Reset release timeout if needed. */
	protected mayResetReleaseTimeout() {
		if (this.releaseTimeout) {
			clearTimeout(this.releaseTimeout)
		}

		if (isFinite(this.releaseTimeoutMs)) {
			this.releaseTimeout = setTimeout(this.releaseResources.bind(this), this.releaseTimeoutMs)
		}
	}

	/** Release all resources. */
	protected releaseResources() {
		this.allFresh = false
		this.startDataLoaded = false
		this.map.clear()
		this.onReleaseResources()
	}

	protected onReleaseResources() {}


	protected cleanImportedSources() {
		let toClear: string[] = []
		let timestamp = Logger.getTimestamp()

		for (let [uri, item] of this.map) {
			if (item.reason === TrackReasonMask.Imported
				&& item.latestUseTime + CheckImportedTimeInterval < timestamp
			) {
				toClear.push(uri)
			}
		}

		for (let uri of toClear) {
			this.untrackFile(uri)
		}
	}

	/** 
	 * Ensure specified content be fresh, if it has been included.
	 * Normally use this only for imported sources.
	 */
	async uriBeFresh(uri: string): Promise<boolean> {
		let item = this.map.get(uri)
		if (!item) {
			return false
		}

		if (!item.fresh) {
			await this.updateFile(uri, item)
		}

		item.latestUseTime = this.timestamp

		return true
	}

	/** Update all the contents that need to be updated. */
	private async doUpdating() {
		if (!this.startDataLoaded) {
			await this.loadStartData()
		}

		this.updatePromises = []

		Logger.timeStart('update')

		for (let [uri, item] of this.map.entries()) {
			if (!item.fresh) {
				this.updateFile(uri, item)
			}

			item.latestUseTime = this.timestamp
		}

		// May push more promises when updating.
		for (let i = 0; i < this.updatePromises.length; i++) {
			let promise = this.updatePromises[i]
			await promise
		}

		let updatedCount = this.updatePromises.length
		Logger.timeEnd('update', `${updatedCount} files loaded`)

		this.updatePromises = []
	}

	/** Update one file, returns whether updated. */
	private async updateFile(uri: string, item: FileTrackerItem): Promise<boolean> {
		if (!this.hasIgnored(uri)) {
			if (!item.updatePromise) {
				item.updatePromise = this.createUpdatePromise(uri, item)
				this.updatePromises.push(item.updatePromise)
				await item.updatePromise
				item.updatePromise = null
			}

			return true
		}

		return false
	}

	/** Doing update and returns a promise. */
	private async createUpdatePromise(uri: string, item: FileTrackerItem) {
		if (!item.document) {
			item.document = await this.loadDocument(uri)

			if (item.document) {
				item.version = item.document.version
			}
		}
		
		if (item.document) {
			item.fresh = true
			await this.parseDocument(uri, item.document)

			// Very important, release document memory usage after symbols generated
			if (!item.opened) {
				item.document = null
			}

			Logger.log(`${decodeURIComponent(uri)} loaded${item.opened ? ' from opened document' : ''}`)
		}
	}

	/** Load text content and create one document. */
	protected async loadDocument(uri: string): Promise<TextDocument | null> {
		let languageId = path.extname(uri).slice(1).toLowerCase()
		let document = null

		try {
			let text = (await fs.readFile(URI.parse(uri).fsPath)).toString('utf8')
			
			// Very low resource usage for creating one document.
			document = TextDocument.create(uri, languageId, 1, text)
		}
		catch (err) {
			console.error(err)
		}

		return document
	}

	/** After file tracked. */
	protected onFileTracked(_uri: string) {}

	/** After file expired. */
	protected onFileExpired(_uri: string) {}

	/** After file untracked. */
	protected onFileUntracked(_uri: string) {}

	/** Parsed document. */
	protected async parseDocument(_uri: string, _document: TextDocument) {}
}