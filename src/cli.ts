#!/usr/bin/env -S npx tsx
// CLI wrapper so the tool runs without an MCP client.
// It prints the real CMC calls (endpoint, status, credits) before the brief.
import { CmcClient, CmcError } from "./cmc.ts";
import { compareTokens, formatBrief, marketContext, tokenHealthBrief } from "./brief.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const context = args.includes("--context");
const rest = args.filter((a) => !a.startsWith("--"));
const [cmd, a, b] = rest;

function usage(): never {
  console.log(`ths-cmc: market-data health brief from CoinMarketCap

  ths-cmc brief <symbol|address> [--context] [--json]
  ths-cmc compare <tokenA> <tokenB>
  ths-cmc context

Needs CMC_API_KEY in the environment (see .env.example).`);
  process.exit(cmd ? 1 : 0);
}

function printCalls(client: CmcClient) {
  console.log("CMC API calls made:");
  for (const c of client.calls) {
    const p = Object.entries(c.params)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    console.log(`  GET ${c.endpoint}${p ? `?${p}` : ""}  ->  HTTP ${c.status}, ${c.credits ?? "?"} credit, ${c.elapsed_ms} ms`);
  }
  console.log("");
}

async function main() {
  const client = new CmcClient();
  if (cmd === "brief" && a) {
    const r = await tokenHealthBrief(client, a, { includeContext: context });
    if (json) return console.log(JSON.stringify(r, null, 2));
    printCalls(client);
    if (r.found) {
      console.log("Response excerpt (real fields from the API):");
      console.log(JSON.stringify(r.evidence.excerpt, null, 2));
      console.log("");
    }
    console.log(formatBrief(r));
  } else if (cmd === "compare" && a && b) {
    const c = await compareTokens(client, a, b);
    if (json) return console.log(JSON.stringify(c, null, 2));
    printCalls(client);
    console.log(formatBrief(c.a), "\n\n----\n");
    console.log(formatBrief(c.b), "\n");
    console.log(`Shared flags: ${c.both.join(", ") || "none"}`);
    console.log(`Only ${a}: ${c.only_a.join(", ") || "none"}`);
    console.log(`Only ${b}: ${c.only_b.join(", ") || "none"}`);
  } else if (cmd === "context") {
    const c = await marketContext(client);
    if (json) return console.log(JSON.stringify(c, null, 2));
    printCalls(client);
    console.log(JSON.stringify(c, null, 2));
  } else usage();
}

main().catch((e) => {
  console.error(e instanceof CmcError ? `CMC error (${e.status}): ${e.message}` : e);
  process.exit(1);
});
