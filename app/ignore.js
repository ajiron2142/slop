// Which files to leave out, by the folder's own .gitignore files, the way git reads them: each
// .gitignore covers its folder and everything below; later lines win; "!" brings a path back;
// a trailing "/" matches only folders; any other "/" ties the pattern to that .gitignore's folder.
// A folder without a .gitignore leaves nothing out. .git itself is always left out.
// Shared by the folder tools (folder.js) and git (folder-git.js).

// Rules from one .gitignore's text, for the folder at `base` ("" for the top).
export function parseIgnore(text, base = '') {
  const rules = [];
  for (let line of text.split('\n')) {
    line = line.replace(/\r$/, '').replace(/(?<!\\)\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    line = line.replace(/\/+$/, '');
    const anchored = line.includes('/');
    line = line.replace(/^\//, '');
    const body = line.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/|\/\*\*|\*\*|\*|\?/g, (m) => (m === '**/' ? '(.*/)?' : m === '/**' ? '/.*' : m === '**' ? '.*' : m === '*' ? '[^/]*' : '[^/]'));
    rules.push({ base, negate, dirOnly, re: new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`) });
  }
  return rules;
}

// The rules so far plus the .gitignore in `dir` (at path `base`), if it has one.
export async function withIgnoreFile(dir, base, rules) {
  try {
    const text = await (await (await dir.getFileHandle('.gitignore')).getFile()).text();
    return [...rules, ...parseIgnore(text, base)];
  } catch {
    return rules;
  }
}

// The rules that apply inside `path`: the top folder's .gitignore and those of each folder on the way.
export async function ignoreRulesFor(root, path, rules = []) {
  let dir = root;
  let base = '';
  rules = await withIgnoreFile(dir, base, rules);
  for (const part of path ? path.split('/') : []) {
    dir = await dir.getDirectoryHandle(part);
    base = base ? `${base}/${part}` : part;
    rules = await withIgnoreFile(dir, base, rules);
  }
  return rules;
}

export function isIgnored(rules, path, isDir) {
  if (path === '.git' || path.endsWith('/.git')) return true;
  let hit = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.base && !path.startsWith(`${r.base}/`)) continue;
    if (r.re.test(r.base ? path.slice(r.base.length + 1) : path)) hit = !r.negate;
  }
  return hit;
}
