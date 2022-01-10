import './css/test.scss'

class App {
	render() {
		return (
			<div>
				<div id="id1" />
				<div className="class1" />
				<div className="class2" />
				<div className={'class3'} />
				<div className={`any-other-class class4`} />
			</div>
		)
	}
}