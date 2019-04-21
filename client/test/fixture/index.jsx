class App {
	render() {
		return (
			<div>
				<div id="id1" />
				<div class="class1" />
				<div className="class2" />
				<div className={'class3'} />
				<div className={`any-other-class class4`} />
				<div className={`any-other-class ` + any_variable_or_expression + ` class5`} />
			</div>
		)
	}
}