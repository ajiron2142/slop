# Vendored libraries

ESM builds copied from the npm packages, with `sourceMappingURL` comments removed (the maps are not vendored).

| File | Package | Version | Source |
|---|---|---|---|
| `marked.esm.js` | marked | 18.1.0 | https://www.npmjs.com/package/marked (`lib/marked.esm.js`) |
| `purify.es.js` | dompurify | 3.4.16 | https://www.npmjs.com/package/dompurify (`dist/purify.es.mjs`, renamed to `.js` so any static server sends a JavaScript MIME type) |
| `idb-keyval.js` | idb-keyval | 6.3.0 | https://www.npmjs.com/package/idb-keyval (`dist/index.js`) |
| `highlight/core.min.js`, `highlight/languages/*.min.js` | @highlightjs/cdn-assets | 11.12.0 | https://www.npmjs.com/package/@highlightjs/cdn-assets (`es/core.min.js` and `es/languages/<name>.min.js`; only the languages imported in `app/highlight.js`) |

The same versions are listed in `package.json` (development only), so `npm audit` and GitHub's Dependabot alerts warn when one has a known security problem.

To update: bump the version in `package.json`, run `npm install`, then `npm run vendor` (copies the same files and drops the `sourceMappingURL` line), bump the version here, and run `npm test`.
