class App {
	render() {
		return (
			<div>
				<div id="id1" />
				<div className="class1" />
				<div className={'class2'} />
				<div className={`any-other-class class3`} />
				<div className={`any-other-class ` + any_variable_or_expression + ` class4`} />
			</div>
		)
	}
}