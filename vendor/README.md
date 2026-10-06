# Vendored libraries

ESM builds copied from the npm packages, with `sourceMappingURL` comments removed (the maps are not vendored).

| File | Package | Version | Source |
|---|---|---|---|
| `marked.esm.js` | marked | 18.1.0 | https://www.npmjs.com/package/marked (`lib/marked.esm.js`) |
| `purify.es.js` | dompurify | 3.4.16 | https://www.npmjs.com/package/dompurify (`dist/purify.es.mjs`, renamed to `.js` so any static server sends a JavaScript MIME type) |
| `idb-keyval.js` | idb-keyval | 6.3.0 | https://www.npmjs.com/package/idb-keyval (`dist/index.js`) |

To update: `npm pack <name>@<version>`, extract, copy the same file, delete the `sourceMappingURL` line, and bump the version here.
