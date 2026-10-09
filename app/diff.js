// Line diffs, shared by write mode (to review a change) and git (to show one to the model).

// Line diff with 3 lines of context around each change. Lines are [mark, text, oldLine, newLine]
// with mark ' ', '+', '-' or '…' (a gap). `lines.stats` has the added and removed counts.
export function diffLines(a, b, created) {
  // A final newline ends the last line; it isn't an extra empty line.
  const split = (t) => (t ? t.replace(/\n$/, '').split('\n') : []);
  const A = split(a);
  const B = split(b);
  let out;
  if (created) out = B.map((l) => ['+', l]);
  else {
    let start = 0;
    while (start < A.length && start < B.length && A[start] === B[start]) start++;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) { endA--; endB--; }
    const mid = middle(A.slice(start, endA), B.slice(start, endB));
    out = [...A.slice(0, start).map((l) => [' ', l]), ...mid, ...A.slice(endA).map((l) => [' ', l])];
  }
  let oldNo = 0;
  let newNo = 0;
  for (const l of out) {
    if (l[0] !== '+') oldNo++;
    if (l[0] !== '-') newNo++;
    l.push(oldNo, newNo);
  }
  const stats = { add: out.filter((l) => l[0] === '+').length, del: out.filter((l) => l[0] === '-').length };
  // Keep only changed lines and their context; mark gaps.
  const keep = out.map((l, i) => l[0] !== ' ' || out.slice(Math.max(0, i - 3), i + 4).some((m) => m[0] !== ' '));
  const lines = [];
  out.forEach((l, i) => {
    if (keep[i]) lines.push(l);
    else if (keep[i - 1] || i === 0) lines.push(['…', '']);
  });
  lines.stats = stats;
  return lines;
}

// The changed middle of two files, via longest common subsequence (small inputs) or as a block.
function middle(A, B) {
  if (A.length * B.length > 4_000_000) return [...A.map((l) => ['-', l]), ...B.map((l) => ['+', l])];
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]);
    else out.push(['+', B[j++]]);
  }
  while (i < n) out.push(['-', A[i++]]);
  while (j < m) out.push(['+', B[j++]]);
  return out;
}

// The same diff as text, like `git diff`: each part starts with "@@ -old +new @@" line numbers.
export function unifiedText(lines) {
  const out = [];
  let head = true;
  for (const [mark, text, oldNo, newNo] of lines) {
    if (mark === '…') { head = true; continue; }
    if (head) out.push(`@@ -${mark === '+' ? oldNo + 1 : oldNo} +${mark === '-' ? newNo + 1 : newNo} @@`);
    head = false;
    out.push(mark + text);
  }
  return out.join('\n');
}
