Product: THS CMC MCP (working name: ths-cmc-mcp)
Feature: Full product (hackathon entry)
Slug: ths-cmc-mcp
Author: Gabriel Mangabeira
Date: 2026-09-30
Status: Draft
Version: 1.0

# PRD: THS CMC MCP

## Problem Statement

When I ask an AI assistant whether a token looks risky, I want it to answer from live market data with the source field shown, so I can trust the answer instead of a model's memory.

## Target User

- **ICP:** Crypto-curious builders and analysts who already use an AI assistant (Claude, Cursor, any MCP client) to research tokens.
- **Sub-segment:** People who need a fast first-pass check before opening a full scan.
- **Key pain point:** LLMs answer token questions from stale training data and cite nothing. Raw market APIs return hundreds of fields and no judgment.

## Press Release Test

THS CMC MCP launches today, giving anyone with an MCP client the ability to ask "is this token healthy?" and get a sourced answer in seconds. Unlike a chat model guessing from memory, it calls CoinMarketCap live and shows the exact field behind every risk flag. One question in, a short brief out, with the evidence attached. Repo on GitHub.

## Competitive Differentiation

- **Alternatives:** Ask a chat model (stale, no sources). Read CMC's site by hand (slow, no flags). Generic CMC MCP wrappers (raw data, no judgment).
- **What they miss:** A rule-based interpretation layer where every flag cites a field and a value.
- **Why this approach:** I run Token Health Scan, so the flag logic comes from scoring tokens for a living. This tool is the market-data slice only. It is not the THS scanner score and never claims to be.

## Goals & Success Metrics

| Metric | Baseline | Target | How Measured |
|---|---|---|---|
| Submission accepted as valid before deadline | 0 | 1 valid DoraHacks BUIDL by 23:59 UTC Sep 30 | DoraHacks submission page shows it published |
| Submission meets every required item | 0 of 7 | 7 of 7 | Checklist in SUBMISSION.md, ticked by me before submit |
| Live-call reliability in the demo | n/a | 2 of 2 tokens return a full brief with no errors | Smoke script output saved in the repo |
| Reach | 0 | CMC retweet or quote (stretch) | X notifications Oct 1 to Oct 19 |

## Scope

**In scope:**
- An MCP server with 3 tools over CMC Pro API endpoints the current key can reach.
- A CLI wrapper that prints the real request and response excerpt, so a demo works without an MCP client.
- Rule-based flags, each citing the CMC field and value.
- README, SUBMISSION.md, X post draft, a 60 to 90 second captioned demo video.
- Fixture-based tests plus one live smoke test.

**Out of scope:**
- No on-chain analysis, holder data, contract audits or wallet checks. That is the full THS scanner.
- No buy/sell advice, price prediction or single "safety score" presented as THS's score.
- No web UI, database, auth or payments.
- No changes to the `token-health-radar` repo.
- No paid APIs beyond the existing CMC key. No voiceover.

## Feature Requirements

**Story 1:** As a user in an MCP client, I want to ask for a token's health brief by symbol or contract address, so that I get sourced risk flags in one call.
- AC1: `token_health_brief` returns price, market cap, FDV, 24h volume, supply figures and rank from `quotes/latest`, plus identity and links from `info`.
- AC2: Every risk flag lists the CMC field name, the value, and the rule that fired.
- AC3: The brief states plainly: "Market-data signals from CoinMarketCap. Not the THS on-chain scan."
- AC4: An unknown token returns a clear "not found" message, not a crash or a made-up brief.

**Story 2:** As a user, I want to see market context, so that a token's move is not read in a vacuum.
- AC1: `market_context` returns global metrics and the Fear and Greed value with its classification.
- AC2: The token brief can include this context when asked.

**Story 3:** As a user, I want to compare two tokens side by side, so that I can see which has the weaker signals.
- AC1: `compare_tokens` takes two symbols and returns the same fields and flags in one table.
- AC2: Flags that differ are marked.

**Story 4:** As a hackathon judge, I want to run the tool and see a real API call, so that I can verify it works.
- AC1: The CLI prints the endpoint, the status code and a trimmed real response before the brief.
- AC2: The README has copy-paste install and run steps that work on a clean machine.
- AC3: The repo contains no API key, only `.env.example`.

## Flag Rules (draft, all from fields I confirmed exist on this key)

| Flag | Rule | CMC field |
|---|---|---|
| Large FDV gap | FDV above 3x market cap | `fully_diluted_market_cap`, `market_cap` |
| Thin trading | 24h volume under 1% of market cap | `volume_24h`, `market_cap` |
| Suspicious volume | 24h volume above 50% of market cap | same |
| Supply mismatch | self-reported market cap differs from CMC's by over 25% | `self_reported_market_cap`, `market_cap` |
| Few venues | `num_market_pairs` under 10 | `num_market_pairs` |
| DEX-heavy liquidity | DEX share of volume above 80% | `dex_volume_24h`, `volume_24h` |
| Young token | listed under 90 days | `date_added` |
| Sharp recent drop | 7d change below -30% | `percent_change_7d` |
| CMC notice | any text in `notice` | `notice` (from `info`) |

Thresholds are starting values. I state them in the README as rules of thumb, not findings.

## AI / Agent Section

- **Model:** None inside the tool. Rules are deterministic. The user's MCP client supplies the LLM.
- **Tool use:** 3 MCP tools: `token_health_brief`, `market_context`, `compare_tokens`.
- **Memory:** None. Stateless, one live call per request.
- **Output format:** Structured JSON plus a short text summary.
- **Uncertainty handling:** Missing fields are shown as "not available", never guessed.
- **Refusal triggers:** Will not give price targets or buy/sell advice.
- **Failure modes:** CMC 4xx/5xx returns the status and message. Rate limit (50 calls/minute on this plan) returns a retry message.

## Constraints

- Deadline: submissions close Wed Sep 30, 23:59 UTC. Build cutoff for "working end to end": 21:30 UTC.
- Key plan (confirmed 2026-09-30): 50 requests/minute, 15,000 credits/month, 14,130 left.
- Reachable endpoints confirmed with real calls: `/v1/key/info`, `/v2/cryptocurrency/quotes/latest`, `/v2/cryptocurrency/info`, `/v1/global-metrics/quotes/latest`, `/v1/cryptocurrency/listings/latest`, `/v3/fear-and-greed/latest`.
- Blocked on this plan: `/v1/cryptocurrency/market-pairs/latest` (403, error 1006). Do not use it.
- Unclear: `/v4/dex/pairs/quotes/latest` returned 200 with an empty list for my test address. Needs a correct network and pair address before use.
- Originality rule: new standalone repo, CMC integration is the whole project.
- Hackathon also requires: public repo, demo, X post with #BuildwithCMC, named endpoints, visible API evidence, an API-feedback note, one track (AI Agents and Automation).

## Build Plan (UTC)

| Window | Work |
|---|---|
| 18:45 to 19:15 | Pre-mortem fixes, scaffold, API client with retries and rate-limit guard |
| 19:15 to 20:15 | The 3 tools, flag engine, CLI wrapper |
| 20:15 to 20:45 | Fixture tests plus live smoke test, fix bugs |
| 20:45 to 21:30 | README, SUBMISSION.md, X post draft. **Cutoff: working end to end** |
| 21:30 to 22:15 | Demo recording, frame check, secret sweep |
| 22:15 to 23:15 | Public push, DoraHacks submit, X post (my two manual steps, Gabriel approves each) |
| 23:15 to 23:59 | Buffer |

## Open Questions

1. Is Gabriel registered for the hackathon on DoraHacks with his CMC account email? — **Owner:** Gabriel — **Decide by:** 19:00 UTC
2. OK to create a public GitHub repo under gmangabeira for this? — **Owner:** Gabriel — **Decide by:** 22:00 UTC
3. Which X account posts, and does Gabriel want to review the text first? — **Owner:** Gabriel — **Decide by:** 22:15 UTC
4. Correct `/v4/dex` parameters for a real pair. — **Owner:** build agent — **Decide by:** 20:00 UTC (drop DEX if not solved)

---
## [GAPS: Needs Your Input]

1. Tool count and names: I inferred 3 tools. Fewer is fine if time runs short.
2. Flag thresholds: inferred from common rules of thumb, not from THS scoring data.
3. Registration status on DoraHacks: unknown.
