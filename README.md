# ths-cmc-mcp

**An MCP server that turns live CoinMarketCap data into a sourced token health brief. Every risk flag shows the CMC field and value it came from.**

I built this for the [Build with CMC: API Hackathon](https://dorahacks.io/hackathon/coinmarketcap-api-202609/detail) (track: AI Agents and Automation). It is a new, standalone tool written for this event. It is separate from the [Token Health Scan](https://tokenhealthscan.com) scanner, and it does not use or claim that scanner's score.

## The problem

When I ask an AI assistant whether a token looks risky, it answers from old training data and cites nothing. Raw market APIs return hundreds of fields and no judgment. This tool sits between them: it calls CMC live, applies nine plain rules, and shows its work.

## What it does

Three MCP tools:

| Tool | What it returns |
|---|---|
| `token_health_brief` | Price, market cap, FDV, volume, supply, rank, plus risk flags for a token by symbol (`SOL`) or contract address |
| `market_context` | Fear & Greed index, global market cap and volume, BTC and ETH dominance |
| `compare_tokens` | Two briefs side by side, with shared flags and flags that differ |

A CLI wraps the same code, so the demo runs without an MCP client. It prints the real API calls before the brief.

### Real output

`npm run cli -- brief TRUMP --context` (live run, 2026-09-30):

```
CMC API calls made:
  GET /v2/cryptocurrency/quotes/latest?symbol=TRUMP&convert=USD&skip_invalid=true  ->  HTTP 200, 1 credit, 284 ms
  GET /v2/cryptocurrency/info?id=35336  ->  HTTP 200, 1 credit, 149 ms

OFFICIAL TRUMP (TRUMP)  rank 87  listed 2025-01-18
Price $2.03   Market cap $571.38M   FDV $2.03B
Volume 24h $342.58M   DEX volume $2.48M   Pairs 740

Flags (3):
  [WATCH] Large gap between market cap and fully diluted value
      rule: fully_diluted_market_cap is 3x or more of market_cap (10x or more = high)
      from: fully_diluted_market_cap=2,027,126,355.48, market_cap=571,380,356.769, ratio=3.55
  [WATCH] Unusually heavy trading for its size
      rule: volume_24h is over 50% of market_cap
      from: volume_24h=342,580,940.133, market_cap=571,380,356.769, volume_to_mcap_pct=60
  [WATCH] Project-reported market cap differs from CMC's
      rule: self_reported_market_cap differs from market_cap by more than 25%
      from: self_reported_market_cap=405,425,707.127, market_cap=571,380,356.769, difference_pct=29
```

A large, liquid token such as SOL fires no flags. The full outputs are in [`demo/outputs/`](demo/outputs).

## CMC API endpoints used

| Endpoint | Used for |
|---|---|
| `GET /v2/cryptocurrency/quotes/latest` | Price, market cap, FDV, volume (CEX and DEX), supply, pairs, date added, rank |
| `GET /v2/cryptocurrency/info` | Token identity, category, links, contract address, CMC `notice`, and address lookup |
| `GET /v3/fear-and-greed/latest` | Market mood |
| `GET /v1/global-metrics/quotes/latest` | Global market cap, volume, dominance |

## The nine rules

Each flag lists the rule, the CMC fields, and the values. Thresholds are rules of thumb, not findings.

| Flag | Fires when | CMC fields |
|---|---|---|
| `fdv_gap` | FDV is 3x or more of market cap (10x = high) | `fully_diluted_market_cap`, `market_cap` |
| `thin_trading` | 24h volume under 1% of market cap (under 0.1% = high) | `volume_24h`, `market_cap` |
| `heavy_volume` | 24h volume over 50% of market cap | `volume_24h`, `market_cap` |
| `supply_mismatch` | Self-reported market cap differs from CMC's by over 25% | `self_reported_market_cap`, `market_cap` |
| `few_venues` | Under 10 market pairs | `num_market_pairs` |
| `dex_heavy` | DEX share of volume over 80% | `dex_volume_24h`, `volume_24h` |
| `young_token` | Listed under 90 days ago (under 30 = high) | `date_added` |
| `sharp_drop` | 7 day change under -30% (under -50% = high) | `percent_change_7d` |
| `cmc_notice` | CMC shows a notice (info only, never scored as risk) | `info.notice` |

If a field is missing, the brief says so. It never guesses.

## Install and run

```bash
git clone https://github.com/gmangabeira/ths-cmc-mcp
cd ths-cmc-mcp
npm install
cp .env.example .env        # add your CMC_API_KEY
export CMC_API_KEY=...      # or load it however you prefer

npm run cli -- brief SOL
npm run cli -- brief TRUMP --context
npm run cli -- brief 0xdAC17F958D2ee523a2206206994597C13D831ec7
npm run cli -- compare SOL TRUMP
```

### Use it in an MCP client (Claude Desktop, Cursor, Claude Code)

```json
{
  "mcpServers": {
    "ths-cmc": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ths-cmc-mcp/src/server.ts"],
      "env": { "CMC_API_KEY": "your_key_here" }
    }
  }
}
```

Then ask: "Give me a health brief for TRUMP and tell me which flags matter."

## Tests

```bash
npm test          # 19 tests: rule thresholds, recorded real CMC responses, mocked pipeline
npm run smoke     # live: starts the MCP server, calls every tool against the real CMC API
```

Fixtures in `tests/fixtures/` are real recorded responses (no key, no headers). `scripts/capture-fixtures.mts` re-records them.

## What the API made possible, and where it got in the way

**What worked well.** One `quotes/latest` call returns market cap, FDV, CEX volume, DEX volume, pair count, date added and the project's own self-reported market cap. That covers eight of my nine rules from a single request. The `self_reported_market_cap` field was the most useful surprise: comparing it with CMC's own market cap is a cheap cross-check, and it is what flagged TRUMP in the demo.

**Where it got in the way.**

1. **Address lookup rejects checksummed addresses.** `info?address=0xdAC1...` returns `400 Invalid value for 'slug': 'null'`. The same address in lowercase works. The error message points at the wrong parameter. I lowercase EVM addresses before calling.
2. **`error_code` is a string on some endpoints.** `/v3/fear-and-greed/latest` returns `"0"`, while v1 and v2 return the number `0`. A strict `!== 0` check treats success as failure.
3. **Symbols collide.** `quotes/latest?symbol=X` returns a list, and several active tokens can share one symbol. I pick the lowest `cmc_rank`. Passing a contract address avoids the guess.
4. **`market-pairs/latest` returned 403** (error 1006) on the plan I used, so I could not add per-exchange concentration checks.
5. **The DEX quotes endpoint returned an empty list** for the one address I tried, so I left it out rather than ship something I could not verify.
6. **`notice` is free text.** One example: WLD carries a note about analytics coverage on World Chain. It is useful context but not a risk signal, so I show notices as info only.

## Limits

- Market data only. It does not read the chain, holders, contracts or liquidity locks. The full on-chain scan is [Token Health Scan](https://tokenhealthscan.com).
- Thresholds are my rules of thumb. A flag is a reason to look closer, not a verdict.
- Not financial advice.

## License

MIT. Built by Gabriel Mangabeira.
