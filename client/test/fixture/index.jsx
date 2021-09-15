import style from './css/test.scss'
import './css/test.scss'

class App {
	render() {
		$('.class10')

		return (
			<div>
				<div id="id1" />
				<div class="class1" />
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