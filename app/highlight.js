import hljs from '../vendor/highlight/core.min.js';
import bash from '../vendor/highlight/languages/bash.min.js';
import c from '../vendor/highlight/languages/c.min.js';
import cpp from '../vendor/highlight/languages/cpp.min.js';
import csharp from '../vendor/highlight/languages/csharp.min.js';
import css from '../vendor/highlight/languages/css.min.js';
import diff from '../vendor/highlight/languages/diff.min.js';
import dockerfile from '../vendor/highlight/languages/dockerfile.min.js';
import go from '../vendor/highlight/languages/go.min.js';
import ini from '../vendor/highlight/languages/ini.min.js';
import java from '../vendor/highlight/languages/java.min.js';
import javascript from '../vendor/highlight/languages/javascript.min.js';
import json from '../vendor/highlight/languages/json.min.js';
import kotlin from '../vendor/highlight/languages/kotlin.min.js';
import markdown from '../vendor/highlight/languages/markdown.min.js';
import php from '../vendor/highlight/languages/php.min.js';
import powershell from '../vendor/highlight/languages/powershell.min.js';
import python from '../vendor/highlight/languages/python.min.js';
import ruby from '../vendor/highlight/languages/ruby.min.js';
import rust from '../vendor/highlight/languages/rust.min.js';
import sql from '../vendor/highlight/languages/sql.min.js';
import typescript from '../vendor/highlight/languages/typescript.min.js';
import xml from '../vendor/highlight/languages/xml.min.js';
import yaml from '../vendor/highlight/languages/yaml.min.js';

// Syntax colours for code blocks. Each language also answers to its usual
// short names (js, ts, py, sh, html, yml, toml, ps1…). To add one, copy its file
// into vendor/highlight/languages/ and add it here.
const LANGUAGES = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, php, powershell, python, ruby, rust, sql, typescript, xml, yaml };
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

// Colours a <code> element in place. Unknown or missing languages stay plain.
// highlight.js escapes the text, so this is as safe as setting textContent.
export function highlight(code, lang) {
  if (!code || !lang || !hljs.getLanguage(lang)) return;
  code.innerHTML = hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true }).value;
}
