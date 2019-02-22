import * as path from 'path'
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

import {readText, glob, getStat} from './util'
import Uri from 'vscode-uri'

export interface TrackMapItem {
	document: TextDocument | null
	version: number
	fresh: boolean
}

export class FileTracker {

	includeGlobPattern: string
	excludeGlobPattern: string | undefined
	updateImmediately: boolean = false

	map: Map<string, TrackMapItem> = new Map()
	fresh: boolean = true

	private includeMatcher: minimatch.IMinimatch
	private excludeMatcher: minimatch.IMinimatch | null

	constructor(connection: Connection, documents: TextDocuments, includeGlobPattern: string, excludeGlobPattern?: string, updateImmediately?: boolean) {
		if (includeGlobPattern && path.isAbsolute(includeGlobPattern)) {
			throw new Error(`includeGlobPattern parameter "${includeGlobPattern}" should not be an absolute path pattern`)
		}

		this.includeGlobPattern = includeGlobPattern || '**/*'
		this.excludeGlobPattern = excludeGlobPattern
		this.includeMatcher = new minimatch.Minimatch(this.includeGlobPattern)
		this.excludeMatcher = this.excludeGlobPattern ? new minimatch.Minimatch(this.excludeGlobPattern) : null
		this.updateImmediately = updateImmediately || false
		
		documents.onDidChangeContent(this.onFileOpenOrContentChanged.bind(this))
		documents.onDidClose(this.onFileClosed.bind(this))
		connection.onDidChangeWatchedFiles(this.onWatchedPathChanged.bind(this))
	}

	//no need to handle file opening because we have preloaded all the files
	//open and changed event will be distinguished by document version later
	private onFileOpenOrContentChanged(event: TextDocumentChangeEvent) {
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

	private onFileClosed(event: TextDocumentChangeEvent) {
		let document = event.document
		let filePath = Files.uriToFilePath(document.uri)
		
		if (filePath && this.canTrackFilePath(filePath)) {
			this.unTrackOpenedFile(filePath)
		}
	}

	//no need to handle file changes making by vscode when document is opening, and document version > 1 at this time
	private async onWatchedPathChanged(params: DidChangeWatchedFilesParams) {
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
				let stat = await getStat(fileOrFolderPath)
				if (stat.isFile()) {
					let filePath = fileOrFolderPath
					if (this.canTrackFilePath(filePath)) {
						this.trackFile(filePath)
					}
				}
			}
			else if (change.type === FileChangeType.Deleted) {
				this.unTrackPath(fileOrFolderPath)
			}
		}
	}

	async trackPath(fileOrFolderPath: string) {
		if (!this.canTrackPath(fileOrFolderPath)) {
			return
		}

		let stat = await getStat(fileOrFolderPath)
				
		if (stat.isDirectory()) {
			this.trackFolder(fileOrFolderPath)
		}
		else if (stat.isFile()) {
			let filePath = fileOrFolderPath
			if (this.canTrackFilePath(filePath)) {
				this.trackFile(filePath)
			}
		}
	}
	
	private async trackFolder(folderPath: string) {
		let filePaths = await this.getFilePathsInFolder(folderPath)

		for (let filePath of filePaths) {
			await this.trackFile(filePath)
		}
	}
	
	private async getFilePathsInFolder(folderPath: string): Promise<string[]> {
		let cssFilePaths = await glob(`${folderPath.replace(/\\/g, '/')}/${this.includeGlobPattern}`, {
			ignore: this.excludeGlobPattern || undefined,
			nodir: true
		})
		
		return cssFilePaths.map(path.normalize)
	}

	private trackFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			//when been tracked, version=0
			//after read, version=1
			//after first opening, version=1
			//after been edited in vscode, version always > 1
			//and we will restore the version to 1 after closed
			//so version=1 means have read, and not been opened or just opened without any edit
			if (item.version === 1) {
				item.document = null
				item.fresh = false
				this.fresh = false
				this.onExpired(filePath, item)
				console.log(`"${filePath}" expired`)
			}
		}
		else {
			item = {
				document: null,
				version: 0,
				fresh: false
			}

			this.map.set(filePath, item)
			this.fresh = false
			this.onTrack(filePath, item)
			console.log(`"${filePath}" tracked`)
		}

		if (!item.fresh && this.updateImmediately) {
			this.doUpdate(filePath, item)
		}
	}

	//document was captured from vscode event, and its always the same document object for the same file
	private trackOpenedFile(filePath: string, document: TextDocument) {
		let item = this.map.get(filePath)
		if (item) {
			//both newly created document and firstly opened document have version=1
			let changed = document.version > item.version
			item.document = document
			item.version = document.version

			if (changed && item.fresh) {
				item.fresh = false
				this.fresh = false
				this.onExpired(filePath, item)
				console.log(`"${filePath}" expired`)
			}
		}
		else {
			item = {
				document,
				version: document.version,
				fresh: false
			}

			this.map.set(filePath, item)
			this.fresh = false
			this.onTrack(filePath, item)
			console.log(`"${filePath}" tracked`)
		}

		if (!item.fresh && this.updateImmediately) {
			this.doUpdate(filePath, item)
		}
	}

	private unTrackOpenedFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			//it becomes same as not opened document, but still fresh
			item.version = 1
			console.log(`"${filePath}" closed`)
		}
	}

	unTrackPath(deletedPath: string) {
		for (let filePath of this.map.keys()) {
			if (filePath.startsWith(deletedPath)) {
				let item = this.map.get(filePath)
				if (item) {
					this.map.delete(filePath)
					this.onUnTrack(filePath, item)
					console.log(`"${filePath}" removed`)
				}
			}
		}
	}

	async beFresh() {
		if (!this.fresh) {
			let promises: Promise<void>[] = []
			for (let [filePath, item] of this.map.entries()) {
				if (!item.fresh) {
					promises.push(this.doUpdate(filePath, item))
				}
			}

			await Promise.all(promises)
			this.fresh = true
		}
	}

	private async doUpdate(filePath: string, item: TrackMapItem) {
		if (!item.document) {
			item.document = await this.loadDocumentFromFilePath(filePath)
			item.version = item.document!.version
		}
		
		item.fresh = true
		await this.onUpdated(filePath, item)
		console.log(`"${filePath}" updated`)
	}

	private async loadDocumentFromFilePath(filePath: string): Promise<TextDocument | null> {
		let languageId = path.extname(filePath).slice(1).toLowerCase()
		let uri = Uri.file(filePath).toString()
		let document = null

		try {
			let text = await readText(filePath)
			document = TextDocument.create(uri, languageId, 1, text)
		}
		catch (err) {
			console.log(err)
		}

		return document
	}

	protected onTrack(filePath: string, item: TrackMapItem) {}
	protected onExpired(filePath: string, item: TrackMapItem) {}
	protected async onUpdated(filePath: string, item: TrackMapItem) {}
	protected onUnTrack(filePath: string, item: TrackMapItem) {}
}