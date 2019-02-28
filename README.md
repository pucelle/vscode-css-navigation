# CSS Navigation - VSCode Extension

Allowing **Go to definition** from HTML to CSS, or **Find References** from CSS to HTML.


## Features

### Go to Definition and Peek Definition

In a HTML document, or document whose extension is specified by `activeHTMLFileExtensions`, choose `Go to definition` or `Peek definition`, the extension will search related css selectors as definitions. Available CSS file extensions can also be specified by `activeCSSFileExtensions` option.

Only within `<html-tag>`, `class="class-name"`, `id="id-name"`, you can `Go to definition` or `Peek definition`.

Nesting reference names in Scss or Less are automatically combined:

[nesting](images/nesting.gif)


### Workspace symbols

Allow to search workspace symbols in CSS files across all activated workspace folders.

[workspace-symbol](images/workspace-symbol.gif)


### Class Name and ID Completion

Provide class name and id completion for your HTML files.

It doesn't follow the `<link>` tag in your HTML file to limit the completion results, but list all the available completion labels in your workspace folder.

[completion](images/completion.gif)


### Find All References and Peek References

Supports looking for CSS selector references in your HTML files.

This functionality should not be very usefull, and it needs to load and parse all the files configured in `activeHTMLFileExtensions` additionally. but if you love examining and refactoring CSS codes, at least it's much better than searching them in folders.

[reference](images/reference.gif)


## Performance

At beginning, this project is a fork from [vscode-css-peek](https://github.com/pranaygp/vscode-css-peek/tree/master/client), and fixed Scss nesting reference problem.

But then I found it eats so much CPU & memory: One of my project have about 10 MB css files, on my MacBook Pro V2014, it needs 6s to load (about 1s to search files and 5s to parse) and uses 700 MB memory. 

Finally I decided to implement a new css parser, which also supports Scss & Less. It's a very simple parser and not 100% strict, but it's fast enough. Now it cost about 0.8s to search files, and about 0.2s to parse them. After releasing all the unnecessary resource, the memory usage in caching parsed results is even smaller than the total file size.

Otherwise, all the things will be started only when required by default, so CSS files are loaded only when you begin to search definitions, completion, or workspace symbols. You may change this behavior by specify `preloadCSSFiles` option.


## Configuration

 - `activeHTMLFileExtensions`: The languages of the html files, in where you can `go to definition`. View <https://code.visualstudio.com/docs/languages/identifiers> for more languages. Default value is `[ "html", "ejs", "erb", "php", "hbs", "js", "ts", "jsx", "tsx"	]`.
 - `activeCSSFileExtensions`: The extensions of the css files, only the matched files you can `go to` and `peek`. Default value is `["css", "less", "scss"]`. Currently not support other languages, you can specify more extensions, but the related files will be parsed as CSS.
 - `excludeGlobPatterns`: A glob pattern, defines paths to exclude from when searching for CSS definitions. Default value is `[ "**/node_modules/**", "**/bower_components/**" ]`.
 - `alsoSearchDefinitionsInStyleTag`: Is `false` by default. When set to `true`, will also search CSS definitions in `<style>` tag for current document.
 - `searchAcrossWorkspaceFolders`: When `false` by default, only search CSS definition in current workspace folder. If your workspace folder requires css references from another workspace folder in current worksapce, you should set this to `true`.
- `preloadCSSFiles`: When `false` by default, CSS files are loaded only when required, that's why you need to wait for a while when searching for definitions at the first time. By set it to `true`, CSS files are loaded immediately after you change and save it or VSCode startup. If you are a heavy user in CSS definition searching, just check it.
 - `ignoreSameNameCSSFile`: When `true` by default, e.g.: If 'the-name.scss and 'the-name.css', which share the same basename, are exist in the same directory, the 'the-name.css' will be skipped. If you prefer compiling Scss or Less file to the same name CSS file, this would be very helpful.
 - `ignoreCustomElement`: "When `true` by default, custom element definitions in CSS will be ignored, such that it will go to it's defined place directly.


## Questions

### Can I change definition order to make sass files always before the css files?

No, VSCode always sort the definition results, seems in name order. If you don't like duplicate css definitions, you can remove the `css` in `activeCSSFileExtensions` option, or compile css file to the same folder, and keep `ignoreSameNameCSSFile` as `true`.


### Slow when I go to definition for the first time after workspace startup.

Everything work on lazy mode by default, so it will not take up CPU and memory early. Set `preloadCSSFiles` to `true` will cause CSS files are loaded before your need it, So you will get results immediately even for the first time.


## Can't search across all workspace folders

By default, definition searching is **limited in the same workspace folder**, that means when you choose `Go to definition` in a html file, the definitions you got are always come from the same workspace folder where the html file in.

Searching references, completion also works like this.

Workspace symbols results are always come from multiple workspace folders, but for each workspace folder, you need to open one HTML or CSS file to **activate** it, then it will return results belong to it.

If you have more than one folders in your workspace, and you definitely need to find definitions across them, set `searchAcrossWorkspaceFolders` to `true`. This option will also activate services for all workspace folders as soon as possibile.



## License

MIT