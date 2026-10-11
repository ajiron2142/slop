// npm run vendor: copies the libraries listed in package.json into vendor/, exactly as vendor/README.md
// describes. To update one: bump its version in package.json, run `npm install`, then `npm run vendor`,
// update the version in vendor/README.md, and run `npm test`. Development only; never deployed.
import { readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = (...p) => join(root, 'node_modules', ...p);
const to = (...p) => join(root, 'vendor', ...p);

// The source map comment points at a file that isn't vendored, so it goes.
const copy = (src, dest) => writeFileSync(dest, readFileSync(src, 'utf8').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n'));

copy(from('marked', 'lib', 'marked.esm.js'), to('marked.esm.js'));
copy(from('dompurify', 'dist', 'purify.es.mjs'), to('purify.es.js'));
copy(from('idb-keyval', 'dist', 'index.js'), to('idb-keyval.js'));
copy(from('@highlightjs', 'cdn-assets', 'es', 'core.min.js'), to('highlight', 'core.min.js'));
copyFileSync(from('@highlightjs', 'cdn-assets', 'LICENSE'), to('highlight', 'LICENSE'));
// Only the languages already vendored (the ones app/highlight.js lists).
for (const file of readdirSync(to('highlight', 'languages'))) copy(from('@highlightjs', 'cdn-assets', 'es', 'languages', file), to('highlight', 'languages', file));

console.log('Copied into vendor/. Update the versions in vendor/README.md, then run npm test.');
