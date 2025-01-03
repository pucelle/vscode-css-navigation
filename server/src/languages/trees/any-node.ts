import {AnyToken} from '../scanners'
import {Part} from '../parts/part'


/** Build a simple tree by tokens. */
export class AnyTokenNode<T extends AnyToken<number>> {

	readonly token: T
	readonly parent: AnyTokenNode<T> | null
	readonly children: AnyTokenNode<T>[] | null = null

	/** Definition end. */
	defEnd: number = -1

	constructor(token: T, parent: AnyTokenNode<T> | null) {
		this.token = token
		this.parent = parent
	}

	get isRoot(): boolean {
		return this.token.start === -1
	}

	/** Sort walking of parts. */
	*sortParts(walk: Iterable<Part>): Iterable<Part> {
		let list = [...walk]
		list.sort((a, b) => a.start - b.start)
		yield* list
	}

	/** Walk all nodes, exclude root node. */
	*walk(): Iterable<this> {
		if (!this.isRoot) {
			yield this
		}

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
