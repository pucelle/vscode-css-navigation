# CSS Navigation - VSCode Extension

Peek definition from HTML document, into a CSS / LESS / SCSS documents.


## Features

### Go to Definition and Peek Definition

In a HTML document (or document whose language is specified by `htmlLanguages` option), choose `Go to definition` or `Peek definition`, the extension will search related css selectors as definitions. The css file extensions can be specified by `cssFileExtensions` option.

Only within `<html-tag>`, `class="class-name"`, `id="id-name"` in html file, you can `Go to definition` or `Peek definition`.

Nesting reference names in SCSS are automatically fixed:

[nesting](images/nesting.gif)

Definition searching is **limited in the same workspace folder**: right now when you choose `Go to definition` in a html file, the definitions you got are always come from the same workspace folder the html file in.


### Workspace symbols

[workspace-symbol](images/workspace-symbol.gif)

Search workspace symbols across all activated workspace folders. Nesting reference names are fixed here too.


### Performance

On my macbook pro 2015, 1M CSS file needs about one second to process, and will take up about 70MB memory.

This seems to be a problem, a big project may have 10M+ CSS files, which means about 1GB memory will be used.


## Configuration

 - `htmlLanguages`: The languages of the html files, in where you can `go to definition`. View <https://code.visualstudio.com/docs/languages/identifiers> for more languages. Default value is `[ "html", "ejs", "erb", "php", "hbs", "javascript", "typescript", "javascriptreact", "typescriptreact"	]`.
 - `cssFileExtensions`: The extensions of the css files, only the matched files you can `go to` and `peek`. Default value is `["css", "less", "scss"]`. Currently not support other languages, you can specify more extensions, but the related files will be parsed as CSS.
 - `excludeGlobPatterns`: A glob pattern, defines paths to exclude from when searching for CSS definitions. Default value is `[ "**/node_modules/**", "**/bower_components/**" ]`.
 - `ignoreCustomElement`: Set to `true` to ignore custom element's css definitions, such that it will go to it's defined place without been disturbed. Default value is `false`.
 - `updateImmediately`: When `false` by default, CSS files are loaded only when required, that's why you need to wait for a while when searching for definitions at the first time. By set it to `true`, CSS files are loaded immediately after you change and save it or project startup. If you are a heavy user in CSS definition searching and don't mind additional CPU and memory usage, just check it.


## Questions

### Can I change definition order to make sass files always before the css files?
No, VSCode always sort the definition results, seems in name order. If you don't like duplicate css definitions, you can remove the `css` in `cssFileExtensions` option.

### Is there a plan to implement searching css definitions across all workspace folders?
Currently no. But it can be implemented, I need more reqiurement feedbacks about this.

### Is there a plan to make it can search css references across html files?
Currently no. But I'm a heavy css editor too, so I'm also considering about it.

### Can I search styles that embeded in the same html file?
Not support it. But using `Ctrl + D` to select next in VSCode should be a good alternative.

### Slow when I go to definition for the first time after workspace startup.
Try set `updateImmediately` to `true`.


## References
[vscode-css-peek](https://github.com/pranaygp/vscode-css-peek/tree/master/client).


## License
MIT