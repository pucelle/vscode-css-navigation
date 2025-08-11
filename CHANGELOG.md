# ChangeLog


## [2.8.2]

- Reduce bundle size.
- Fix #109, resolve syntaxes like `:class="a ? 'b' : 'c'"`.


## [2.8.1]

- Option `enableClassNameDefinitionDiagnostic` changes back to `false` because not work with some css modules.


## [2.8.0]

- Provides Class Name CodeLens feature.
- Option `enableClassNameDefinitionDiagnostic` becomes `true` by default.


## [2.7.3]

- Fix the issue where inputting `-` before property declarations can't trigger css variable name completion.


## [2.7.2]

- Fix an issue which will cause wrong offset for embedded CSS .
- Reduce re-diagnose frequency.


## [2.7.1]

- Update readme to provide detailed description about diagnostic feature.
- Option `enableSharedCSSFragments` rename to `enableGlobalEmbeddedCSS`.


## [2.7.0]

- Provides `enableGlobalEmbeddedCSS` option, if your HTML codes contain imported CSS or CSS fragments which should be shared across whole workspace, you can set it to `true`.
- Provides css class name reference diagnostic service, can set `enableClassNameReferenceDiagnostic=true` to enable it.
- Supports loading remote css sources.
- Changes `enableClassNameDiagnostic` to `enableClassNameDefinitionDiagnostic`.


## [2.6.0]

- For #107, supports class name diagnostic.
- Change option `enableCSSVariableColor` to `enableCSSVariableColorPreview`.


## [2.5.0]

- For #106, supports css variable name completion when overwriting variable value.


## [2.4.0]

- Now will show CSS selector comment and several style properties on completion items.
- Adjust CSS Selector hover info to place comment in the head.


## [2.3.10]

- Fix #104, will not suggest for react components as a tag selector in CSS.


## [2.3.9]

- Fix #103, now self-closed React Element like `<Image />` can be rightly detected.
- Fix a parsing issue when js codes contain `/`.


## [2.3.8]

- For #102, When finding references, will exclude current selector from reference list.
  But you will still find it exist until we can find a way to disable VSCode built-in CSS Reference feature.


## [2.3.7]

- Add `astro` to HTML file extension list.
- CSS Selector Hover message format adjusted, has a space after selector, before `{`.


## [2.3.6]

- Fix the issue that `style.setProperty('--')` can't get completion.


## [2.3.5]

- Fix an issue that cause wrongly parsing self-close tag.


## [2.3.4]

- Now the class name can be completed without needing to input the first character.


## [2.3.3]

- Fix the issue that files included by `alwaysIncludeGlobPatterns` get excluded by excluding rules.
- Fix the issue that sometimes template literal html`...` can't be rightly parsed.


## [2.3.2]

- Provides more detailed error log about which file is failed to parse.
- One file parsing failed will not cause whole service crush.


## [2.3.1]

- Fix the issue that can't resolve HTML imports like `<link rel="stylesheet" href="...">`.


## [2.3.0]

- Removes `ignoreSameNameCSSFile` option, if you are using it, use `excludeGlobPatterns` or `ignoreFilesBy` instead.
- Fix the issue that can't find references from not opened js or ts files.
- Can rightly release those not been included in workspace resources after they get closed.
- Will release long-unused resources, and reload them again if required.
- Can follow import chain when searching definitions.


## [2.2.2]

- `ignoreFilesBy` not affect HTML files when looking for references.
- Will release opened and imported documents after they are not in use.


## [2.2.1]

- Fix an issue which will cause css variable service crash when reference tag selector.


## [2.2.0]

- Provides full **CSS Variable** service include **Definition / Completion / Reference / Hover**
- Shows color and value preview in css variable completion list.
- Will start css variable completion after input `--`, no need to input `var()`.
- Provides a `disableOwnCSSVariableCompletion` option to avoid css variable completion with default completion service.
- Fix a crash issue when doing css variable completion.
- Improves searching performance.


## [2.1.2]

- Fix an issue which will cause parsing core stuck when have HTML comments.


## [2.1.1]

- Completion items get numeric sorting, e.g.:
	- before: `.class1`, `.class10`, `.class2`
	- after: `.class1`, `.class2`, `.class10`


## [2.1.0]

- Fix the bug that can't get new definition/completion after document edited.
- Clean repetitive completion items, now they will never repeat. (except repeat with that provided by other plugins)
- Now completion items have different icons to match their types.
- Provides service for `html` and `css` template literal, this is useful when you are using frameworks like `lit.html`.
- Better React JSX Element detection.


## [2.0.3]

- Fix #94 - error "Duplicate capture group name" and cause plugin crash, thanks to `onetrev@github` .


## [2.0.2]

- Fix a token parser issue which will cause wrongly paring typescript documents and cause plugin stuck.


## [2.0.1]

- Rename `ignoreCustomElement` to `ignoreCustomAndComponentTagDefinition`, and it affects Component Tag like React Component.


## [2.0.0]

- Upgrade to a new parsing core, same efficient, more stable, codes cleaner.
- Supports class name hover action, thanks to `sduzair@github` from [#92](https://github.com/pucelle/vscode-css-navigation/issues/92).
- Supports CSS Variable finding definition, completion and reference features.
- Supports language features for selector like codes like jquery selector `$('.class-name')`, document query selector...
- Now finding references can be started from HTML or CSS files, and will always find from both HTML and CSS files.
- Options `alwaysIncludeImportedFiles` and `alsoSearchDefinitionsInStyleTag` were removed, these two features are always enabled.
- Codes have got a big change, if you meet any problem with new version, please notify me at [https://github.com/pucelle/vscode-css-navigation/issues].


## [1.15.1]

- Fix #93, will not miss sass nesting selectors when selector name contains interpolation `#{...}`.


## [1.15.0]

- Can only read at most 1000 files when doing finding definitions or references, this can avoid searching stuck when a workspace have too many..., e.g., pre-rendered HTML files.
- Changes README by #91.


## [1.14.1]

- Merge codes from `wolfsilver@github`, goto definition will always pick closest path of current path.
- Can find references like `:class="x.x"` that located in `vue` files.


## [1.14.0]

- Fixes many bugs, reduce package size.


## [1.13.0]

- Supports auto completion in a CSS-like document, will complete for custom element names, class names and ids that exist in html documents.


## [1.12.0]

- Supports tab-indented Sass syntax.


## [1.10.0]

- Adds `enableLogLevelMessage`, removes `preloadCSSFiles`.
- Can goto files after clicking `<link href="...">` or `@import "..."`.
- Supports completion for inner style tags.
- Can goto definition from HTML to HTML.


## [1.9.0]

- Can specifies always include some sources even they should be ignores from `excludeGlobPatterns`, `.gitignore` or `.npmignore`.


## [1.8.0]

- Supports ignores files by `.gitignore` or `.npmignore`.


## [1.7.0]

- Supports disabling all four main functionality separately.


## [1.6.0]

- Will always load files from `@import ...` for CSS files even it's in `node_modules`.

## [1.5.0]

- Supports `Module CSS`.


## [1.4.0]

- Will aspect nested `.gitignore` and `.npmignore` in different folders when looking for CSS definitions.
- Fix the issue that `class="..."` can't be recognized in `jsx` and `tsx` file.
- Can find CSS definitions in ES template css`...`.


## [1.3.0]

- Will ignore the files listed in `.gitignore` when looking for CSS definitions.


## [1.2.0]

- Now `.any-class.class1` and `p.class1` will match definition for `.class1`.


## [1.1.0]

- Supports looking for CSS definitions in `JSX` language.


## [1.0.3]

- Skips `coverage` directory.


## [1.0.2]

- Fix `a{@at-root b}` -> `a b`.


## [1.0.1]

- First release.
