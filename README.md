# TunaPay MCP

Let your AI assistant pay online with a **TunaPay prepaid USD Visa card**, while you stay in control of every cent.

Works with Claude (desktop and web), Claude Code, Cursor, and any client that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

## How it keeps your money safe

- **You approve every payment.** The AI can only create a *pending* request. Nothing is charged until you tap approve in Telegram or on tunapay.ai. Requests expire after 10 minutes.
- **One card per purchase.** Each approved request opens a one-time card loaded with exactly the amount needed. It freezes itself after that one payment.
- **Your wallet, your cards.** Money only moves from your own TunaPay wallet onto your own card. The plugin cannot send crypto or pay another person.
- **Your key, revocable anytime.** You create a personal plugin key on the tunapay.ai member page and can revoke it with one click.

## 1. Get a key

1. Sign up at **[tunapay.ai](https://tunapay.ai)** and top up your wallet.
2. Open the member page, go to **AI payment plugin**, and create a plugin key (it starts with `tpk_`).

The plugin is available to TunaPay membership-tier members.

## 2. Connect your AI

### Claude (desktop or claude.ai): no key copying needed

Settings → Connectors → **Add custom connector**, paste:

```
https://tunapay.ai/gw/mcp
```

Claude opens the TunaPay approval page; sign in and click **Allow**.

### Claude Code

```bash
claude mcp add --transport http tunapay https://tunapay.ai/gw/p/mcp --header "Authorization: Bearer tpk_YOUR_KEY"
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tunapay": {
      "url": "https://tunapay.ai/gw/p/mcp",
      "headers": { "Authorization": "Bearer tpk_YOUR_KEY" }
    }
  }
}
```

### Run it locally instead (stdio)

This repository is a zero-dependency local server (Node.js 18+) that talks to the same TunaPay API. Use it with any client that launches local MCP servers:

```json
{
  "mcpServers": {
    "tunapay": {
      "command": "npx",
      "args": ["-y", "github:tunakingrwa/tunapay-mcp"],
      "env": { "TUNAPAY_KEY": "tpk_YOUR_KEY" }
    }
  }
}
```

## Tools

| Tool | What it does | Moves money? |
|---|---|---|
| `wallet` | Wallet balance and how approvals reach you | No |
| `find_card` | Which card has actually been charged successfully at a given merchant | No |
| `list_cards` | Your cards (last 4 digits, status, balance), never full numbers | No |
| `request_new_card` | Ask you to approve a one-time card for one purchase | Only after you approve |
| `request_recharge` | Ask you to approve topping up one of your cards | Only after you approve |
| `check_request` | Status of a request (pending, done, expired…) | No |
| `get_card_details` | Card details of an unused one-time card this plugin opened, to fill a checkout | No |

## Example

> "Buy me one month of Cursor Pro."

1. The AI checks which card works at Cursor and asks for a one-time card of $20.
2. You get a Telegram message and tap **Approve**.
3. The AI fills the checkout with the one-time card. The card freezes after the payment.

## Notes

- Cards work for subscriptions and normal online purchases. They cannot top up developer API credit balances (for example the OpenAI or Anthropic consoles).
- Never paste your plugin key into a chat. If a key leaks, revoke it on the member page and create a new one.
- Questions: [tunapay.ai](https://tunapay.ai)

## License

MIT
