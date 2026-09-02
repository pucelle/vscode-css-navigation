import {describe, expect, it} from 'vitest'
import {shouldRestartForConfigurationChange} from '../client/src/configuration'


function changedSetting(name: string) {
	return shouldRestartForConfigurationChange(section => section === `CSSNavigation.${name}`)
}


describe('configuration lifecycle', () => {
	it('updates ordinary feature and diagnostic settings without restarting', () => {
		expect(changedSetting('maxHoverStylePropertyCount')).toBe(false)
		expect(changedSetting('enableClassNameDefinitionDiagnostic')).toBe(false)
		expect(changedSetting('diagnosticIgnoredClassNames')).toBe(false)
		expect(changedSetting('enableCompletions')).toBe(false)
	})

	it('restarts when tracked files or parsed document structure changes', () => {
		expect(changedSetting('activeHTMLFileExtensions')).toBe(true)
		expect(changedSetting('excludeGlobPatterns')).toBe(true)
		expect(changedSetting('jsClassNameReferenceNames')).toBe(true)
		expect(changedSetting('enableGlobalEmbeddedCSS')).toBe(true)
	})
})
