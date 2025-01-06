import style from './css/test.scss'
import './css/test.scss'
import './css/app.css'


class App {
	render() {
		$('.match-jquery-selector')
		document.querySelector('.match-querySelector')
		document.querySelectorAll('.match-querySelectorAll')

		html `
			<div class="class-in-html-template"></div> 
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
				<div class={['class8', { class9: this.show }, 'class10']}></div>
			</div>
		)
	}
}