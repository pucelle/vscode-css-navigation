import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'**/out/**',
			'**/node_modules/**',
			'**/.vscode-test/**',
			'eslint.config.mjs',
		],
	},
	eslint.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-deprecated': 'error',

			// Allow intentionally-unused identifiers prefixed with `_` (e.g. unused handler params).
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			}],

			// The CSS/HTML parsers deliberately over-escape special characters inside regexes for
			// readability and consistency; such escapes are semantically harmless, and stripping
			// them by hand in a parser is needless regression risk for no functional gain.
			'no-useless-escape': 'off',

			// TypeScript namespaces (Logger, Picker, PartConvertor, ...) are used here as a
			// deliberate, working code-organization pattern; converting them all to ES modules
			// would touch every import site across the server for no functional gain.
			'@typescript-eslint/no-namespace': 'off',
		},
	},
)
