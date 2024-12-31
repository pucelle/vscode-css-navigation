import {CSSToken} from '../scanners'
import {AnyTokenNode} from './any-node'


/** CSS token type. */
export enum CSSTokenNodeType {
	Root,
	Command,
	Selector,
	PropertyName,
	PropertyValue,
}


/** Build a simple tree by tokens. */
export class CSSTokenNode extends AnyTokenNode<CSSToken> {

	declare readonly parent: CSSTokenNode | null
	declare readonly children: CSSTokenNode[] | null

	readonly type: CSSTokenNodeType

	// `|{`, for only selector node.
	closureStart: number = -1

	// `}|`, for only selector node.
	closureEnd: number = -1

	/** Comment Token */
	commentToken: CSSToken | null

	constructor(type: CSSTokenNodeType, token: CSSToken, parent: CSSTokenNode | null, commentToken: CSSToken | null = null) {
		super(token, parent)
		this.type = type
		this.commentToken = commentToken

		if (type === CSSTokenNodeType.Command || type === CSSTokenNodeType.Selector || !parent) {
			this.children = []
		}
	}

	get isRoot(): boolean {
		return this.type === CSSTokenNodeType.Root
	}

	get closureLikeEnd(): number {
		return this.closureEnd > -1 ? this.closureEnd : this.token.end
	}
}

