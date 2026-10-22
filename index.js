#!/usr/bin/env node
/*
 * TunaPay MCP server (stdio).
 *
 * Lets your AI assistant pay online merchants with a TunaPay prepaid USD Visa card.
 * This process holds no money and no card data of its own: every tool is a thin call to the
 * public TunaPay plugin API (https://tunapay.ai/gw/p/*) using your personal plugin key.
 * Every money movement is only a PENDING request until you approve it in Telegram or on tunapay.ai.
 *
 * Zero dependencies. Node.js 18+.
 *   TUNAPAY_KEY=tpk_... npx -y github:tunakingrwa/tunapay-mcp
 */

const API = (process.env.TUNAPAY_API || "https://tunapay.ai/gw").replace(/\/+$/, "");
const KEY = (process.env.TUNAPAY_KEY || "").trim();
const VERSION = "1.0.0";
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = [
  "TunaPay lets you pay online merchants with a prepaid USD Visa card funded from the user's TunaPay wallet.",
  "Every money movement needs the user's own approval: request_* tools only create a pending request;",
  "the user approves it in Telegram or on tunapay.ai within 10 minutes. Never claim a payment is done before check_request says status=done.",
  "Typical flow: find_card(platform) -> request_new_card(platform, amount_usd, what_for) -> tell the user to approve ->",
  "poll check_request every ~10s -> get_card_details(card_id) -> fill the checkout -> the card freezes itself after that one payment.",
  "Cards work for subscriptions and normal purchases; they cannot top up developer API credits (OpenAI/Anthropic consoles).",
  "Reply to the user in their language.",
].join(" ");

const RO = { readOnlyHint: true, openWorldHint: true };
const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

const TOOLS = [
  { name: "wallet", title: "Wallet balance", annotations: RO,
    description: "Show the user's TunaPay wallet balance (USD) and how approvals reach them.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (a) => call("GET", "/p/me") },
  { name: "find_card", title: "Which card works here", annotations: RO,
    description: "Which TunaPay card has REALLY been charged successfully at this merchant (from TunaPay's own settlement records). Call before request_new_card. If nothing is proven, do not open a card.",
    inputSchema: { type: "object", properties: { platform: { type: "string", description: "Merchant / service name, e.g. Claude, ChatGPT, Cursor, Midjourney" } },
      required: ["platform"], additionalProperties: false },
    run: (a) => call("GET", "/p/cards-for?platform=" + encodeURIComponent(String(a.platform || ""))) },
  { name: "list_cards", title: "My cards", annotations: RO,
    description: "List the user's cards: id, last 4 digits, status, balance, and whether it was opened by this plugin. Never returns card numbers.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => call("GET", "/p/cards") },
  { name: "request_new_card", title: "Request a one-time card", annotations: RW,
    description: "Ask the user to approve opening a one-time card loaded with the amount to pay. Creates a PENDING request only: no money moves until the user approves (10 min). The card auto-freezes after that one payment succeeds.",
    inputSchema: { type: "object", properties: {
      platform: { type: "string", description: "Merchant you are going to pay (used to pick a proven card)" },
      amount_usd: { type: "number", description: "Exact amount to pay in USD, including tax" },
      what_for: { type: "string", description: "One short line shown to the user, e.g. 'Cursor Pro, 1 month'" },
      card_type_id: { type: "integer", description: "Optional: a specific card_type_id from find_card" } },
      required: ["platform", "amount_usd", "what_for"], additionalProperties: false },
    run: (a) => call("POST", "/p/requests", { action: "open_card", platform: a.platform, amount: a.amount_usd, note: a.what_for, card_type_id: a.card_type_id }) },
  { name: "request_recharge", title: "Request a card top-up", annotations: RW,
    description: "Ask the user to approve moving money from their wallet onto one of their cards. PENDING until the user approves.",
    inputSchema: { type: "object", properties: {
      card_id: { type: "integer" }, amount_usd: { type: "number" },
      what_for: { type: "string", description: "One short line shown to the user" } },
      required: ["card_id", "amount_usd"], additionalProperties: false },
    run: (a) => call("POST", "/p/requests", { action: "recharge", card_id: a.card_id, amount: a.amount_usd, note: a.what_for }) },
  { name: "check_request", title: "Check a request", annotations: RO,
    description: "Status of a request: pending (waiting for the user), done, processing, failed, cancelled or expired. When an open_card request is done, card_id is set.",
    inputSchema: { type: "object", properties: { request_id: { type: "string" } }, required: ["request_id"], additionalProperties: false },
    run: (a) => call("GET", "/p/requests/" + encodeURIComponent(String(a.request_id || ""))) },
  { name: "get_card_details", title: "One-time card details", annotations: RO,
    description: "Card number, CVV, expiry, holder name and billing address of a one-time card THIS plugin opened and that has not been used yet. Use it only to fill the checkout; never store or repeat it.",
    inputSchema: { type: "object", properties: { card_id: { type: "integer" } }, required: ["card_id"], additionalProperties: false },
    run: (a) => call("GET", `/p/cards/${Number(a.card_id)}/details`) },
];

async function call(method, path, body) {
  if (!/^tpk_[a-f0-9]{40}$/.test(KEY))
    return { status: 401, body: { error: "TUNAPAY_KEY is missing or malformed. Create a plugin key on the tunapay.ai member page and set it as TUNAPAY_KEY." } };
  const r = await fetch(API + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: "Bearer " + KEY, "user-agent": "tunapay-mcp/" + VERSION },
    signal: AbortSignal.timeout(110_000),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function handle(msg) {
  const { id, method, params = {} } = msg || {};
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return fail(-32600, "Invalid Request");
  if (id === undefined) return null; // notification
  if (method === "initialize") {
    const want = params.protocolVersion;
    return reply({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "tunapay", title: "TunaPay", version: VERSION }, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return fail(-32602, "Unknown tool: " + params.name);
    const r = await tool.run(params.arguments || {}).catch((e) => ({ status: 0, body: { error: "unreachable", detail: e.message } }));
    const ok = r.status >= 200 && r.status < 300;
    return reply({ content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }], structuredContent: r.body, isError: !ok });
  }
  return fail(-32601, "Method not found: " + method);
}

// stdio transport: one JSON-RPC message per line
const send = (m) => m && process.stdout.write(JSON.stringify(m) + "\n");
let buf = "";
const pending = new Set();
const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); };
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); continue; }
    if (Array.isArray(msg)) track(Promise.all(msg.map(handle)).then((out) => { out = out.filter(Boolean); if (out.length) send(out); }));
    else track(handle(msg).then(send));
  }
});
process.stdin.on("end", () => Promise.allSettled([...pending]).then(() => process.exit(0)));
if (!KEY) process.stderr.write("tunapay-mcp: TUNAPAY_KEY is not set; tools will return an error until it is.\n");
