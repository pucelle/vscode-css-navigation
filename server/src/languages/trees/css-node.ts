import {CSSToken} from '../scanners'
import {AnyTokenNode} from './any-node'


/** CSS token type. */
export enum CSSTokenNodeType {
	Root,
	Command,
	Selector,

	/** Like `from`, `to` of `@keyframes{from{}, to{}}`. */
	ClosureName,

	PropertyName,
	PropertyValue,
}


/** Build a simple tree by tokens. */
export class CSSTokenNode extends AnyTokenNode<CSSToken> {

	declare readonly parent: CSSTokenNode | null
	declare readonly children: CSSTokenNode[] | null

	readonly type: CSSTokenNodeType

	/** Comment Token. */
	commentToken: CSSToken | null

	constructor(type: CSSTokenNodeType, token: CSSToken, parent: CSSTokenNode | null, commentToken: CSSToken | null = null) {
		super(token, parent)
		this.type = type
		this.commentToken = commentToken

		if (type === CSSTokenNodeType.Command
			|| type === CSSTokenNodeType.Selector
			|| type === CSSTokenNodeType.ClosureName
			|| type === CSSTokenNodeType.Root
		) {
			this.children = []
		}
	}

	isRoot(): boolean {
		return this.type === CSSTokenNodeType.Root
	}

	/** Definition end, or end. */
	get defLikeEnd(): number {
		return this.defEnd > -1 ? this.defEnd : this.token.end
	}
}

