import { renderMarkdown } from './markdown.js';

// Copies a reply in two formats at once: formatted HTML, which Teams, Outlook and Word paste,
// and the markdown as plain text for everything else. The HTML gets plain inline styles (the
// kind Outlook understands), so it pastes in neutral colours whatever theme is on screen.
const MONO = 'font-family:Consolas,Menlo,monospace';
const STYLES = [
  ['code', `${MONO};font-size:90%;background:#f2f2f2;padding:1px 4px;border-radius:3px`],
  ['pre', `${MONO};font-size:13px;line-height:1.5;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px 12px;white-space:pre-wrap`],
  ['pre code', 'background:none;padding:0;font-size:inherit'],
  ['table', 'border-collapse:collapse'],
  ['th, td', 'border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top'],
  ['th', 'border:1px solid #d0d7de;padding:4px 8px;text-align:left;background:#f6f8fa'],
  ['blockquote', 'margin:0;padding-left:10px;border-left:3px solid #d0d7de;color:#555'],
];

export function replyHtml(markdown) {
  const doc = new DOMParser().parseFromString(renderMarkdown(markdown), 'text/html');
  for (const [selector, css] of STYLES) for (const node of doc.body.querySelectorAll(selector)) node.setAttribute('style', css);
  return doc.body.innerHTML;
}

export async function copyReply(markdown) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([replyHtml(markdown)], { type: 'text/html' }),
      'text/plain': new Blob([markdown], { type: 'text/plain' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(markdown); // browsers without rich copy still get the text
  }
}
