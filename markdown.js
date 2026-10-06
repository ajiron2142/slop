import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.js';

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Model output is untrusted: everything rendered as HTML goes through DOMPurify.
export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text), { FORBID_ATTR: ['style'] });
}
