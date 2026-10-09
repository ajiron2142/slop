// Line helpers shared by the folder tools and smart paste: grep-style matching and numbered ranges.

export const MAX_LINES = 1000; // lines per read
export const MAX_CHARS = 100_000; // characters per read, for minified files with huge lines

// Case-insensitive unless the query has capitals; literal unless `regex` is set.
export function queryRegex(query, regex) {
  if (!query) throw new Error('no query given');
  const flags = /[A-Z]/.test(query) ? '' : 'i';
  try {
    return new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch (e) {
    throw new Error(`bad regular expression: ${e.message}`);
  }
}

// A final newline ends the last line; it isn't another, empty one.
export function splitLines(text) {
  const lines = text.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

// One matching line: trimmed, and cut to ~160 characters around the match.
export function excerpt(line, re) {
  const text = line.trim();
  if (text.length <= 160) return text;
  const at = Math.max(0, (text.search(re) || 0) - 60);
  return `${at ? '…' : ''}${text.slice(at, at + 160)}…`;
}

// Lines start_line..end_line, numbered, at most MAX_LINES at a time, with a note saying what's left.
export function numberedRange(lines, start, end) {
  const from = Math.min(Math.max(1, start ?? 1), lines.length);
  const to = Math.min(lines.length, end ?? Infinity, from + MAX_LINES - 1);
  let body = '';
  let last = from - 1;
  for (let n = from; n <= to && body.length < MAX_CHARS; n++, last++) body += `${n}\t${lines[n - 1].slice(0, MAX_CHARS)}\n`;
  const note = last < lines.length ? `(lines ${from}–${last} of ${lines.length}; next: start_line ${last + 1})` : `(lines ${from}–${last} of ${lines.length})`;
  return { from, last, text: body + note };
}
