// Usage numbers for the cost meter and the per-reply Stats card. Plain arithmetic on what
// each reply recorded (msg.stats) and what LiteLLM publishes about each model (/model/info).

// A model's prices per token, or null when the proxy doesn't say. Missing prices count as free
// (a model LiteLLM knows but charges nothing for, like a locally hosted one).
export function pricesOf(info) {
  if (!info) return null;
  const input = info.input_cost_per_token ?? 0;
  return { input, output: info.output_cost_per_token ?? 0, cached: info.cache_read_input_token_cost ?? input };
}

export const limitOf = (info) => info?.max_input_tokens ?? info?.max_tokens ?? null;

// Cost of one reply in dollars, split into input and output; null when the price is unknown.
export function costOf(info, { input, output, cached = 0 }) {
  const p = pricesOf(info);
  if (!p) return null;
  return { input: (input - cached) * p.input + cached * p.cached, output: output * p.output };
}

const speedOf = (s) => (s.output && s.ms > s.firstMs ? s.output / ((s.ms - s.firstMs) / 1000) : null);
const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Everything the meter shows for one chat, given the currently selected model.
export function summarize(messages, modelInfo, model) {
  const replies = messages.filter((m) => m.role === 'assistant' && m.stats?.input != null);
  if (!replies.length) return null;
  const byModel = new Map();
  for (const { stats: s } of replies) {
    const row = byModel.get(s.model) ?? { model: s.model, replies: 0, input: 0, output: 0, cost: 0, priced: true, speeds: [] };
    row.replies++;
    row.input += s.input;
    row.output += s.output;
    if (s.cost) row.cost += s.cost.input + s.cost.output;
    else row.priced = false;
    const speed = speedOf(s);
    if (speed) row.speeds.push(speed);
    byModel.set(s.model, row);
  }
  const models = [...byModel.values()].map((r) => ({ ...r, speed: average(r.speeds) }));
  const contexts = replies.map((m) => m.stats.context);
  const context = contexts.at(-1);
  const limit = limitOf(modelInfo[model]);
  const avgOutput = average(replies.map((m) => m.stats.output)) ?? 0;
  const next = costOf(modelInfo[model], { input: context, output: avgOutput });
  return {
    context,
    limit,
    percent: limit ? Math.min(100, Math.round((context / limit) * 100)) : null,
    models,
    cost: models.every((r) => r.priced) ? models.reduce((a, r) => a + r.cost, 0) : null,
    replies: replies.length,
    input: models.reduce((a, r) => a + r.input, 0),
    output: models.reduce((a, r) => a + r.output, 0),
    speed: average(replies.map((m) => speedOf(m.stats)).filter(Boolean)),
    growth: contexts.length > 1 ? (contexts.at(-1) - contexts[0]) / (contexts.length - 1) : null,
    nextCost: next ? next.input + next.output : null,
  };
}

export const replySpeed = speedOf;

export const fmt = {
  int: (n) => Math.round(n).toLocaleString('en-US'),
  short: (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))),
  usd: (n) => (n === 0 ? 'Free' : n < 0.0001 ? '<$0.0001' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`),
  usdShort: (n) => (n === 0 ? 'Free' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`),
  secs: (ms) => `${(ms / 1000).toFixed(1)} s`,
};
