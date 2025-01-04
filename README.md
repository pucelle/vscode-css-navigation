<h1 align="left">
    <img src="https://github.com/pucelle/vscode-css-navigation/raw/master/images/logo.png" width="32" height="32" alt="Using magnifying class to view CSS" />
    CSS Navigation - VSCode Extension
</h1>

Allows **Go to Definition** from HTML like document to CSS / Sass / Less, provides **Completion** and **Workspace Symbols** for Class & CSS Variables & Id, and supports **Find References** from CSS to HTML.


## Features


### Go to Definition and Peek Definition

Choose `Go to definition` or `Peek definition`, the extension will search related CSS & Scss & Less selectors in current workspace folder.

The places you can goto definitions:

- HTML (or files whose extension included by `activeHTMLFileExtensions` option): _<_`html-tag`_>_, _class=_"`class-name`_"_, _id="_`id-name`_"_.
- JSX & TSX: _className="_`class-name`_"_, _className={"_`class-name`_"}_ and others.
- Jquery & DOM Selector: _$('_`class-name`_')_, x._querySelector('_`class-name`_')_, x._querySelectorAll('_`class-name`_')_.
- CSS Variables: `var(--css-variable-name)`.
- Welcome to give feedback about more you like.

![definition](images/definition.gif)


### Class Name and ID Hover Info - New in V2.0

When mouse hover at a class name or a id, will show it's description (leading comment) and first several style properties.
You may configure `maxHoverStylePropertyCount` to specify **How Many Style Properties** to show. If you don't want style properties, set `maxHoverStylePropertyCount` to `0`.

![definition](images/hover.jpg)



### Class Name, CSS Variable and ID Completion

Provides class name and id completion for your HTML files.

![completion](images/completion.gif)



### Workspace symbols

Allows to search workspace symbols in CSS & Scss & Less files across all activated workspace folders.

![workspace-symbol](images/workspace-symbol.gif)



### Find All References and Peek References

Supports looking for CSS selector references across all HTML & CSS files within workspace folder.

When your workspace folder having too much HTML like files, parsing them all may cause stuck, so it limits to read at most 500 files.

![reference](images/reference.gif)



### Features miscellaneous

- Can goto referenced files after clicking url part of `<link href="...">` or `@import "..."`.



### Note about JSX

Note that the JSX template doesn't provide completion for attribute value by default, you may trigger it manually by clicking `Ctrl + Space`, or change settings:

```json
editor.quickSuggestions": {
    "other": true,
    "comments": false,
    "strings": true
},
```


## Configuration

<!-- prettier-ignore -->
| Name                              | Description
| ---                               | ---
| `activeHTMLFileExtensions`        | The languages of the html files, in where you can `go to definition`. Default value is `["html", "ejs", "erb", "php", "hbs", "js", "ts", "jsx", "tsx", "vue", "twig"]`.
| `activeCSSFileExtensions`         | The extensions of the CSS files, only the matched files you can `go to` and `peek`. Default value is `["css", "less", "scss"]`. Currently not support other languages, you can specify more extensions, but the related files will be parsed as CSS.
| `excludeGlobPatterns`             | A glob pattern, defines paths to exclude from when searching for CSS definitions. Default value is `["**/node_modules/**", "**/bower_components/**", "**/vendor/**", "**/coverage/**"]`.
| `alwaysIncludeGlobPatterns`       | A glob pattern, which always use `/` as a path separator, files matched will always be included even they match `excludeGlobPatterns` or listed in `.gitignore` or `.npmignore`. You may use this to include some special codes inside `node_modules`.
| `searchAcrossWorkspaceFolders`    | When `false` by default, only search CSS definition in current workspace folder. If your workspace folder requires css references from another workspace folder in current workspace, you should set this to `true`.
| `ignoreSameNameCSSFile`           | When `true` by default, e.g.: If 'the-name.scss and 'the-name.css', which share the same basename, are exist in the same directory, the 'the-name.css' will be skipped. If you prefer compiling Scss or Less file to the same name CSS file, this would be helpful.
| `ignoreCustomElement`             | When `true` by default, custom element CSS definitions will be ignored, it will not provide definition and completion, such that it goes to it's custom-element defined place directly which has implemented by other plugins.
| `ignoreFilesBy`                   | Specifies this to ignore files and directories list in `.gitignore` or `.npmignore` when looking for css definitions. Default value is `[".gitignore"]`.
| `enableLogLevelMessage`           | Whether enables log level message, set it to `true` for debugging.
| `enableGoToDefinition`            | Whether enables goto definition service, default value is `true`.
| `enableWorkspaceSymbols`          | Whether enables workspace symbol service, default value is `true`.
| `enableIdAndClassNameCompletion`  | Whether enables id and class name completion service, default value is `true`.
| `enableFindAllReferences`         | Whether enables finding references service, default value is `true`.
| `enableHover`                     | Whether enables id and class name hover service, default value is `true`.
| `maxHoverStylePropertyCount`      | When mouse hover at a class or id attribute, how many style properties at most should show. Default value is `4`.


## Why started this project

I'm a heavy CSS developer, I have tried [vscode-css-peek](https://github.com/pranaygp/vscode-css-peek/tree/master/client) in 2019, but I found it eats so much CPU & memory. E.g., one of my project has 280 CSS files, includes 6 MB codes. On my MacBook Pro, it needs 7s to load (1.3s to search files and 6s to parse), and uses 700 MB memory. Otherwise it keeps parsing files every time you input a character, if CSS document is more than 100 KB, CPU usage will keep high when inputting.

Later on my vocation I decided to implement a new css parser, as a result I created a new extension. The CSS parser is very simple and cares about only the plugin should care, it's fast and very easy to extend. Now it costs about 0.8s to search files, and 0.5s to parse them. Memory usage in caching parsed results is only about 40 MB.

By the same parser, finding definitions, completions, references, hover are simply implemented.


## Stress Test & Performance

I loaded 100 MB (0.9 M declarations, 2.8 M lines) CSS files for stress test, it took 8s to parse them, and used about 850 MB memory. After 1 minute, the memory usage fell back to 550 MB. Searching definitions across all 0.9 M declarations cost about 50ms, searching workspace symbols cost about 500ms, and searching completions cost about 230ms.

My environment is Win10, MacBook Pro 2014 version, with power on.


## Plans & More

This plugin has simple and clean codes after version 2.0, I hope it can serve more Frontend developers.

So please give me your feedback. Thanks.


## FAQ

### Can I change definition order to make sass files always before the css files?

No, VSCode always sort the definition results, seems in name order. If you don't like duplicate css definitions, you can remove the `css` in `activeCSSFileExtensions` option, or compile css file to the same folder, and keep `ignoreSameNameCSSFile` as `true`.

From version 1.3.0 there is a `ignoreFilesBy` option, you may specify to ignore css files listed in your `.gitignore`.

### Can't get definitions across all workspace folders

By default, definition searching is **limited in the same workspace folder**, that means when you choose `Go to definition` in a html file, the definitions you got are always come from the same workspace folder where the html file in. Searching references, completions also works like this.

If you have more than one folders in your workspace, and you definitely need to find definitions across them, set `searchAcrossWorkspaceFolders` to `true`.

### Missed some workspace symbols

Workspace symbols are always come from multiple workspace folders, but for each workspace folder, you need to open one HTML or CSS file to **activate** it, then it will return results belong to it.

Set `searchAcrossWorkspaceFolders` to `true` will also activate services for all workspace folders as soon as possible, then you will get full workspace symbols always.

### How the extension filter selectors?

This extension only compare the last part of the selector, the parts are defined by splitting selector by space or several other characters like `>`, `+`, '~'.

So when you are trying to find definitions for `class="class1"`, these selectors will match: `p .class1`, `p.class1`, `.class1.class2`, `.class2.class1`, `.class1:hover`.

Searching tag definition is a little different, it must be the unique part of the selector, which means `p` will not match `div p`, but matches `p:hover`. This can prevent you got so many results.

Searching completion works in the same way.

Searching workspace symbols have a more strict rule than other extensions, which requires the start word boundary must match.

### Many duplicate definitions got. Can you limit the results to only in files specified by `<link>` tags, or check parent nodes to ensure the whole selector match?

It sounds like a good idea. For a complete static project, It should be very easy to follow `<link>` tags, matching whole selector is much harder, but it can also be done.

But the Web architecture is extremely complex today, all you got in your hand may be just a piece of html codes, an unique class name, which cause we can't get enough information about the context.

My suggestion is using unique class name, avoid nesting, which would be also helpful for the code quality of you project.

If you prefer scoped style, and write html and css codes in the same file, searching definitions should be less important for you. But checking option `alsoSearchDefinitionsInStyleTag` will help you to search css definitions in the `<style>` inside your current document.


## License

MIT
