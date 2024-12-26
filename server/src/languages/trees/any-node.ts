import {AnyToken} from '../scanners'


/** Build a simple tree by tokens. */
export class AnyTokenNode<T extends AnyToken<number>> {

	readonly token: T
	readonly parent: AnyTokenNode<T> | null
	readonly children: AnyTokenNode<T>[] | null = null

	constructor(token: T, parent: AnyTokenNode<T> | null) {
		this.token = token
		this.parent = parent
	}

	get isRoot(): boolean {
		return this.token.start === -1
	}

	*walk(): Iterable<this> {
		yield this

		if (this.children) {
			for (let child of this.children) {
				yield* child.walk() as Iterable<this>
			}
		}
	}

	/** If not match filter, will skip itself and all descendants. */
	*filterWalk(filter: (node: this) => boolean): Iterable<this> {

		// Must be root, or match filter.
		if (!(this.isRoot || filter(this))) {
			return
		}
		
		if (!this.isRoot) {
			yield this
		}

		if (this.children) {
			for (let child of this.children) {
				yield* child.walk() as Iterable<this>
			}
		}
	}
}
