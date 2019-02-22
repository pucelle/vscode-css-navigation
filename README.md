# CSS Navigation - VSCode Extension

Peek definition from HTML document, into a CSS / LESS / SCSS documents.


## Features

### Go to Definition and Peek Definition

Within a HTML document (or document whose language is specified by `htmlLanguages` option), move cursor to a html tag / class name/ id property, choose `Go to definition` or `Peek definition`, the extension will search related css selectors as definitions. The css file extensions can be specified by `cssFileExtensions` as below:
[definition](images/definition.gif)




## Configuration

 - **htmlLanguages**: The languages of the html files, in where you can `go to definition`. View <https://code.visualstudio.com/docs/languages/identifiers> for more languages.
 - **cssFileExtensions**: The extensions of the css files, only the matched files you can `go to` and `peek`. Default value is `["css", "less", "scss"]`. Currently not support other languages, you can specify more extensions, but the related files will be parsed as CSS file.
 - **excludeGlobPatterns**: A glob pattern, defines paths to exclude from when searching for CSS definitions.
 - **updateImmediately**: When `false` by default, CSS files are loaded only when required, that's why you need to wait for a while when searching for definitions at the first time. By set it to `true`, CSS files are loaded immediately after you change it or project startup. If you are a heavy user in CSS definition searching and don't mind additional CPU and memory usage, just check it.


## Questions

### Can I change definition order to make sass files always before the css files?

No, VScode always sort the definition results, seems in name order, if you don't like duplicate css definitions bother you, you can remove the `css` in `cssFileExtensions` option.


## I have many workspace folders in a workspace, can I search css definition across these folders?


## References

[vscode-css-peek](https://github.com/pranaygp/vscode-css-peek/tree/master/client).


## License

MIT