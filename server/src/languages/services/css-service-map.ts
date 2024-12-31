import * as path from 'path'
import {TextDocuments} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {replacePathExtension} from '../../helpers'
import {CSSService} from './css-service'
import {BaseServiceMap, BaseServiceMapOptions} from './base-service-map'


export interface CSSServiceMapOptions extends BaseServiceMapOptions {

	/** Whether ignore css when same name scss files exists. */
	ignoreSameNameCSSFile: boolean
}


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends BaseServiceMap<CSSService> {

	private ignoreSameNameCSSFile: boolean

	constructor(documents: TextDocuments<TextDocument>, options: CSSServiceMapOptions) {
		super(documents, options)
		this.ignoreSameNameCSSFile = options.ignoreSameNameCSSFile
	}

	protected createService(document: TextDocument) {
		return new CSSService(document)
	}

	/** Parse document to CSS service, and analyze imported. */
	protected async parseDocument(uri: string, document: TextDocument) {
		super.parseDocument(uri, document)

		let cssService = this.serviceMap.get(uri)!

		// If having `@import ...`, load it.
		let importPaths = await cssService.getImportedCSSPaths()
		for (let importPath of importPaths) {
			this.trackMoreFile(importPath)
		}
	}

	protected onFileTracked(uri: string) {
		super.onFileTracked(uri)

		// If same name scss or less files exist, ignore css files.
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(uri).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(replacePathExtension(uri, 'scss'))
					|| this.has(replacePathExtension(uri, 'less'))
					|| this.has(replacePathExtension(uri, 'sass'))

				if (sassOrLessExist) {
					this.ignore(uri)
				}
			}
			else {
				let cssPath = replacePathExtension(uri, 'css')
				if (this.has(cssPath)) {
					this.ignore(cssPath)
				}
			}
		}
	}

	protected onFileUntracked(uri: string) {
		super.onFileUntracked(uri)

		// If same name scss files deleted, unignore css files.
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(uri).slice(1).toLowerCase()
			if (ext !== 'css') {
				let cssPath = replacePathExtension(uri, 'css')
				if (this.has(cssPath)) {
					this.notIgnore(cssPath)
				}
			}
		}
	}
}
