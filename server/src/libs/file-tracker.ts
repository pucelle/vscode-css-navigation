import * as path from 'path'
import * as _glob from 'glob'
import * as minimatch from 'minimatch'


import {
	TextDocuments,
	TextDocument,
	Connection,
	TextDocumentChangeEvent,
	Files,
	DidChangeWatchedFilesParams,
	FileChangeType
} from 'vscode-languageserver'

import * as file from './file'
import * as timer from './timer'
import Uri from 'vscode-uri'
import {getFilePathsMathGlobPattern} from './file'


export interface FileTrackerItem {
	document: TextDocument | null

	//when file was tracked, version=0
	//after file read from disk, version=1
	//after first opening, version=1
	//after been edited in vscode, version always > 1
	//and we will restore version to 1 after closed
	//so version=1 means have read and not been opened or just opened without any edit
	version: number

	//if file opened, it can capture file system changes and trigger onDidChangeContent
	opened: boolean

	fresh: boolean

	//update request may come from track, or beFresh, we cant makesure they will have no conflict
	//so we need a promise to lock it to avoid two update task are executed simultaneously
	updatePromise: Promise<void> | null
}

export interface FileTrackerOptions {
	connection: Connection
	documents: TextDocuments
	includeGlobPattern: string
	excludeGlobPattern?: string
	updateImmediately?: boolean
	startPath: string | undefined
}

export class FileTracker {

	private includeGlobPattern: string
	private excludeGlobPattern: string | undefined
	private updateImmediately: boolean
	private startPath: string | undefined

	private includeMatcher: minimatch.IMinimatch
	private excludeMatcher: minimatch.IMinimatch | null

	private map: Map<string, FileTrackerItem> = new Map()
	private ignoredFilePaths: Set<string> = new Set()
	private allFresh: boolean
	private startPathLoaded: boolean

	constructor(options: FileTrackerOptions) {
		if (options.includeGlobPattern && path.isAbsolute(options.includeGlobPattern)) {
			throw new Error(`"includeGlobPattern" parameter "${options.includeGlobPattern}" should not be an absolute path pattern`)
		}

		this.includeGlobPattern = options.includeGlobPattern || '**/*'
		this.excludeGlobPattern = options.excludeGlobPattern
		this.includeMatcher = new minimatch.Minimatch(this.includeGlobPattern)
		this.excludeMatcher = this.excludeGlobPattern ? new minimatch.Minimatch(this.excludeGlobPattern) : null
		this.updateImmediately = options.updateImmediately || false
		this.startPath = options.startPath
		this.startPathLoaded = !this.startPath
		this.allFresh = this.startPathLoaded

		if (this.startPath && this.updateImmediately) {
			this.loadStartPath()
		}

		options.documents.onDidChangeContent(this.onDocumentOpenOrContentChanged.bind(this))

		// Seems `onDidSave` not work, handle this logic on reTrackFile.
		//options.documents.onDidSave(this.onDocumentSaved.bind(this))

		options.documents.onDidClose(this.onDocumentClosed.bind(this))

		// There is one interesting bug here, `onDidChangeWatchedFiles` can't been registered for twice, or the first one will stop working.
		// Handle it in top server handler.
		//options.connection.onDidChangeWatchedFiles(this.onWatchedPathChanged.bind(this))
	}

	has(filePath: string): boolean {
		return this.map.has(filePath)
	}

	private async loadStartPath() {
		timer.start('track')
		await this.trackPath(this.startPath!)
		timer.log(`${this.map.size} files tracked in ${timer.end('track')} ms`)
		this.startPathLoaded = true
	}

	// No need to handle file opening because we have preloaded all the files.
	// Open and changed event will be distinguished by document version later.
	private onDocumentOpenOrContentChanged(event: TextDocumentChangeEvent) {
		let document = event.document
		let filePath = Files.uriToFilePath(document.uri)

		if (filePath && this.canTrackFilePath(filePath)) {
			this.trackOpenedFile(filePath, document)
		}
	}

	private canTrackFilePath(filePath: string): boolean {
		if (!this.includeMatcher.match(filePath)) {
			return false
		}

		if (this.excludeMatcher && this.excludeMatcher.match(filePath)) {
			return false
		}

		return true
	}

	private canTrackPath(fileOrFolderPath: string): boolean {
		if (this.excludeMatcher && this.excludeMatcher.match(fileOrFolderPath)) {
			return false
		}

		return true
	}

	// private onDocumentSaved(event: TextDocumentChangeEvent) {
	// 	let document = event.document
	// 	let filePath = Files.uriToFilePath(document.uri)
	// 	let item = this.map.get(filePath!)

	// 	// Since `onDidChangeWatchedFiles` event was triggered so frequently, we only do updating after saved.
	// 	if (item && !item.fresh && this.updateImmediately) {
	// 		this.doUpdate(filePath!, item)
	// 	}
	// }

	private onDocumentClosed(event: TextDocumentChangeEvent) {
		let document = event.document
		let filePath = Files.uriToFilePath(document.uri)
		this.unTrackOpenedFile(filePath!)
	}

	// No need to handle file changes making by vscode when document is opening, and document version > 1 at this time.
	async onWatchedPathChanged(params: DidChangeWatchedFilesParams) {
		if (!this.startPathLoaded) {
			return
		}
		
		for (let change of params.changes) {
			let uri = change.uri
			let fileOrFolderPath = Files.uriToFilePath(uri)

			if (!fileOrFolderPath) {
				continue
			}

			if (change.type === FileChangeType.Created) {
				this.trackPath(fileOrFolderPath)
			}
			else if (change.type === FileChangeType.Changed) {
				let stat = await file.stat(fileOrFolderPath)
				if (stat && stat.isFile()) {
					let filePath = fileOrFolderPath
					if (this.canTrackFilePath(filePath)) {
						this.reTrackFile(filePath)
					}
				}
			}
			else if (change.type === FileChangeType.Deleted) {
				this.unTrackPath(fileOrFolderPath)
			}
		}
	}

	private async trackPath(fileOrFolderPath: string) {
		if (!this.canTrackPath(fileOrFolderPath)) {
			return
		}

		let stat = await file.stat(fileOrFolderPath)
		if (stat && stat.isDirectory()) {
			await this.trackFolder(fileOrFolderPath)
		}
		else if (stat && stat.isFile()) {
			let filePath = fileOrFolderPath
			if (this.canTrackFilePath(filePath)) {
				await this.trackFile(filePath)
			}
		}
	}
	
	private async trackFolder(folderPath: string) {
		let filePaths = await getFilePathsMathGlobPattern(folderPath, this.includeMatcher, this.excludeMatcher)
		for (let filePath of filePaths) {
			this.trackFile(filePath)
		}
	}

	private trackFile(filePath: string) {
		let item = this.map.get(filePath)
		if (!item) {
			item = {
				document: null,
				version: 0,
				opened: false,
				fresh: false,
				updatePromise: null
			}

			this.map.set(filePath, item)
			this.handleTrackFollowed(filePath, item)
		}
	}

	private handleTrackFollowed(filePath: string, item: FileTrackerItem) {
		if (this.updateImmediately) {
			this.doUpdate(filePath, item)
		}
		else {
			this.allFresh = false
			timer.log(`${filePath} tracked`)
			this.onTrack(filePath, item)
		}
	}

	// Still keep data for ignored items.
	ignore(filePath: string) {
		this.ignoredFilePaths.add(filePath)
		timer.log(`${filePath} ignored`)
	}

	notIgnore(filePath: string) {
		this.ignoredFilePaths.delete(filePath)
		timer.log(`${filePath} restored from ignored`)
	}

	hasIgnored(filePath: string) {
		return this.ignoredFilePaths.size > 0 && this.ignoredFilePaths.has(filePath)
	}

	private reTrackFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			if (item.opened) {
				// Changes made in opened files, should be updated after files saved.
				if (!item.fresh && this.updateImmediately) {
					this.doUpdate(filePath, item)
				}
			}
			else {
				item.document = null
				item.version = 0
				this.handleExpired(filePath, item)
			}
		}
		else {
			this.trackFile(filePath)
		}
	}

	private handleExpired(filePath: string, item: FileTrackerItem) {
		if (!item.opened && this.updateImmediately) {
			this.doUpdate(filePath, item)
		}
		else {
			item.fresh = false
			this.allFresh = false
			timer.log(`${filePath} expired`)
			this.onExpired(filePath, item)
		}
	}

	// `document` is always the same object for the same file.
	// Very frequently to trigger when do editing.
	private trackOpenedFile(filePath: string, document: TextDocument) {
		let item = this.map.get(filePath)
		if (item) {
			// Both newly created document and firstly opened document have `version=1`.
			let changed = document.version > item.version
			item.document = document
			item.version = document.version
			item.opened = true

			if (changed && item.fresh) {
				this.handleExpired(filePath, item)
			}
		}
		else {
			item = {
				document,
				version: document.version,
				opened: true,
				fresh: false,
				updatePromise: null
			}

			this.map.set(filePath, item)
			this.handleTrackFollowed(filePath, item)
		}
	}

	private unTrackOpenedFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			// Tt becomes same as not opened document, but still fresh.
			item.document = null
			item.version = 1
			item.opened = false
			timer.log(`${filePath} closed`)
		}
	}

	unTrackPath(deletedPath: string) {
		for (let filePath of this.map.keys()) {
			if (filePath.startsWith(deletedPath)) {
				let item = this.map.get(filePath)
				if (item) {
					this.map.delete(filePath)
					
					if (this.ignoredFilePaths.size > 0) {
						this.ignoredFilePaths.delete(filePath)
					}
					
					timer.log(`${filePath} removed`)
					this.onUnTrack(filePath, item)
				}
			}
		}

		// May restore ignore.
		this.allFresh = false
	}

	async beFresh() {
		if (!this.allFresh) {
			if (!this.startPathLoaded) {
				await this.loadStartPath()
			}

			timer.start('update')

			let promises: Promise<boolean>[] = []
			for (let [filePath, item] of this.map.entries()) {
				if (!item.fresh) {
					promises.push(this.doUpdate(filePath, item))
				}
			}

			let updateResults = await Promise.all(promises)
			let updatedCount = updateResults.reduce((count, value) => count + (value ? 1 : 0), 0)

			if (updatedCount > 0) {
				timer.log(`${updatedCount} files loaded in ${timer.end('update')} ms`)
			}

			this.allFresh = true
		}
	}

	private async doUpdate(filePath: string, item: FileTrackerItem): Promise<boolean> {
		if (!this.hasIgnored(filePath)) {
			item.updatePromise = item.updatePromise || this.getUpdatePromise(filePath, item)
			await item.updatePromise
			item.updatePromise = null
			return true
		}

		return false
	}

	private async getUpdatePromise(filePath: string, item: FileTrackerItem) {
		let hasDocumentBefore = item.opened && !!item.document
		if (!hasDocumentBefore) {
			item.document = await this.loadDocumentFromFilePath(filePath)

			if (item.document) {
				item.version = item.document.version
			}
		}
		
		item.fresh = true
		await this.onUpdate(filePath, item)

		timer.log(`${filePath} loaded${hasDocumentBefore ? ' from document' : ''}`)
	}

	private async loadDocumentFromFilePath(filePath: string): Promise<TextDocument | null> {
		let languageId = path.extname(filePath).slice(1).toLowerCase()
		let uri = Uri.file(filePath).toString()
		let document = null

		try {
			let text = await file.readText(filePath)
			
			// Very low resource usage to create document.
			document = TextDocument.create(uri, languageId, 1, text)
		}
		catch (err) {
			timer.error(err)
		}

		return document
	}

	protected onTrack(_filePath: string, _item: FileTrackerItem) {}
	protected onExpired(_filePath: string, _item: FileTrackerItem) {}
	protected async onUpdate(_filePath: string, _item: FileTrackerItem) {}
	protected onUnTrack(_filePath: string, _item: FileTrackerItem) {}
}