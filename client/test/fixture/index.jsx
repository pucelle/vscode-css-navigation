import style from './css/test.scss'
import './css/test.scss'
import './css/app.css'


function Test() {
	return (
		<button
			className="class1"
			onContextMenu={() => {
				// comment me , "a" will work again
				''.replace( /"\w+":/g, ( match ) => match.replace( /"/g, '' ) );
			}}
		>
			×
		</button>
	);
}

// broken
function Test2() {
	return (
		<div className="class1" />
	);
}


class App {
	className = ''
	render() {
		$('.match-jquery-selector')
		document.querySelector('.match-querySelector')
		document.querySelectorAll('.match-querySelectorAll')

		html `
			<div class="class-in-html-template ${this.className} class-${ this.className }"></div> 
		`

		css`
			.class-in-html-template{
				color: red;
			}
		`

		return (
			<div>
				<div id="id1" />
				<div class="class1" />
				<div styleName="class1" />
				<div className="class2" />
				<div className={'class3'} />
				<div className={`any-other-class class4`} />
				<div className={`any-other-class ` + any_variable_or_expression + ` class5`} />
				<div className={style.class6} />
				<div className={style['class7']} />
				<div className={style.class8 + ' ' + style.class8} ></div>
				<div className={`${style.class8} ${style.class8}`} ></div>
				<div className={variable.property ? style.class8 : style.class8}></div>
				<div x-bind:class="variable ? 'class8' : ''" />
				<Image class={['class8', { class9: this.show }, 'class10']} />
				<ReactComponent />
			</div>
		)
	}
}
