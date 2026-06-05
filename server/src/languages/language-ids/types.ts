type CSSLanguageId = 'css' | 'sass' | 'scss' | 'less'

type HTMLLanguageId = 'jsx' | 'tsx' | 'js' | 'ts' | 'html' | 'vue'

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ambient global type, consumed across the server
type AllLanguageId = HTMLLanguageId | CSSLanguageId