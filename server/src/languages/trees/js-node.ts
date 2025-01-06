import {JSToken} from '../scanners'
import {AnyTokenNode} from './any-node'


/** 
 * Currently have no parent-child struct,
 * but may be extended to support template nesting.
 */
export class JSTokenNode extends AnyTokenNode<JSToken> {
	declare parent: JSTokenNode | null
}