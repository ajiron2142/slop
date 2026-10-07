// Syntax colours for code blocks, using highlight.js. The library and its languages load
// the first time a code block appears, so they never slow down opening the app. Each
// language also answers to its usual short names (js, ts, py, sh, html, yml, toml, ps1…).
// To add one, copy its file into vendor/highlight/languages/ and add its name here.
const LANGUAGES = ['bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile', 'go', 'ini', 'java', 'javascript', 'json', 'kotlin', 'markdown', 'php', 'powershell', 'python', 'ruby', 'rust', 'sql', 'typescript', 'xml', 'yaml'];

let hljs = null;
let loading = null;
const waiting = new Set(); // code elements to colour once the library has loaded
const done = new Map(); // highlighted HTML by language + code, so a streaming reply only redoes the block that changed

function load() {
  loading ??= Promise.all([
    import('../vendor/highlight/core.min.js'),
    ...LANGUAGES.map((name) => import(`../vendor/highlight/languages/${name}.min.js`)),
  ]).then(([core, ...langs]) => {
    hljs = core.default;
    LANGUAGES.forEach((name, i) => hljs.registerLanguage(name, langs[i].default));
    for (const [code, lang] of waiting) if (code.isConnected) highlight(code, lang);
    waiting.clear();
  });
  return loading;
}

// Colours a <code> element in place. Unknown or missing languages stay plain.
// highlight.js escapes the text, so this is as safe as setting textContent.
export function highlight(code, lang) {
  if (!code || !lang) return;
  if (!hljs) {
    waiting.add([code, lang]);
    load();
    return;
  }
  if (!hljs.getLanguage(lang)) return;
  const text = code.textContent;
  const key = `${lang}\n${text}`;
  let html = done.get(key);
  if (html === undefined) {
    html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    if (done.size > 200) done.clear();
    done.set(key, html);
  }
  code.innerHTML = html;
}
