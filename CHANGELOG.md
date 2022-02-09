# ChangeLog


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