import {CodeAction, CodeActionKind, CodeActionParams, Diagnostic} from 'vscode-languageserver'
import {ClassNameDiagnosticCode, ClassNameDiagnosticData} from './diagnostic'


export const AddDiagnosticIgnoredClassNameCommand = 'CSSNavigation.addDiagnosticIgnoredClassName'


function isClassNameDiagnostic(diagnostic: Diagnostic): boolean {
	return diagnostic.source === 'CSS Navigation'
		&& (diagnostic.code === ClassNameDiagnosticCode.DefinitionNotFound
			|| diagnostic.code === ClassNameDiagnosticCode.ReferenceNotFound)
		&& typeof (diagnostic.data as Partial<ClassNameDiagnosticData> | undefined)?.className === 'string'
}


/** Provide persistent suppression fixes for CSS Navigation class-name diagnostics. */
export function getCodeActions(params: CodeActionParams): CodeAction[] {
	let actions: CodeAction[] = []
	let addedActions = new Set<string>()

	for (let diagnostic of params.context.diagnostics) {
		if (!isClassNameDiagnostic(diagnostic)) {
			continue
		}

		const {className} = diagnostic.data as ClassNameDiagnosticData

		for (const [target, targetTitle] of [['workspace', 'Workspace'], ['user', 'User']] as const) {
			let actionKey = `${target}:${className}`
			if (addedActions.has(actionKey)) {
				continue
			}

			addedActions.add(actionKey)

			let title = `Ignore "${className}" in ${targetTitle} Settings`

			actions.push({
				title,
				kind: CodeActionKind.QuickFix,
				diagnostics: [diagnostic],
				command: {
					title,
					command: AddDiagnosticIgnoredClassNameCommand,
					arguments: [{className, target, uri: params.textDocument.uri}],
				},
			})
		}
	}

	return actions
}
