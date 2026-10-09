import { streamChat } from './api.js';

// Chat titles (optional add-on): after a chat's first reply, one short extra request asks the same
// model for a title of a few words. It happens once per chat and the title never changes after that.
// If the request fails, or the answer doesn't fit the rule below, the chat keeps its first-message title.
//
// To remove it: delete this file and tests/suites/titles.mjs, and their lines in index.html,
// tests/run.mjs and main.js (marked "chat titles").

// The model is asked for something short (it usually complies); titleFrom() below is the rule that
// decides, and the chat list cuts off anything wider than its column, so a title always fits.
const PROMPT = 'Write a title for this conversation: at most 5 words and about 30 characters. ' +
  'Use common abbreviations when they help it fit (k8s, DB, config, auth, env). ' +
  'Reply with the title only: no quotes, no punctuation at the end, nothing else.';
const MAX_WORDS = 8;
const MAX_CHARS = 60;

// The title for a chat from its first message and reply, or null to keep the one it has.
export async function autoTitle(settings, messages) {
  const first = messages.find((m) => m.role === 'user');
  const reply = messages.find((m) => m.role === 'assistant');
  if (!first?.content || !reply?.content) return null;
  let text = '';
  try {
    await streamChat({
      settings,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `User: ${first.content.slice(0, 1500)}\n\nAssistant: ${reply.content.slice(0, 1500)}` },
      ],
      maxTokens: 100, // room for models that think first; the title itself is a few words
      onDelta: (delta) => { text += delta; },
    });
  } catch {
    return null;
  }
  return titleFrom(text);
}

// The rule: the first non-empty line, without wrapping quotes or trailing punctuation, of at most
// 8 words and 60 characters. Anything else is refused, and the chat keeps its first-message title.
export function titleFrom(text) {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  const title = line.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[.!?:;,]+$/, '').replace(/\s+/g, ' ').trim();
  return title && title.length <= MAX_CHARS && title.split(' ').length <= MAX_WORDS ? title : null;
}
