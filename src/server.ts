#!/usr/bin/env -S npx tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CmcClient, CmcError } from "./cmc.ts";
import { compareTokens, formatBrief, marketContext, tokenHealthBrief } from "./brief.ts";

const server = new McpServer({ name: "ths-cmc-mcp", version: "1.0.0" });

const text = (t: string, structured?: unknown) => ({
  content: [{ type: "text" as const, text: t }],
  ...(structured ? { structuredContent: structured as Record<string, unknown> } : {}),
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof CmcError ? `CMC error (${e.status}): ${e.message}` : String(e) }],
});

server.registerTool(
  "token_health_brief",
  {
    title: "Token health brief",
    description:
      "Live CoinMarketCap market-data brief for a token, by symbol (SOL) or contract address. Returns price, market cap, FDV, volume, supply and risk flags. Every flag cites the CMC field and value. Not the THS on-chain scan.",
    inputSchema: {
      token: z.string().describe("Token symbol such as SOL, or a contract address"),
      include_context: z.boolean().optional().describe("Also add Fear & Greed mood"),
    },
  },
  async ({ token, include_context }) => {
    try {
      const b = await tokenHealthBrief(new CmcClient(), token, { includeContext: include_context });
      return text(formatBrief(b), b);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "market_context",
  {
    title: "Market context",
    description: "Current crypto market mood from CoinMarketCap: Fear & Greed index plus global market cap, volume and BTC/ETH dominance.",
    inputSchema: {},
  },
  async () => {
    try {
      const c = await marketContext(new CmcClient());
      return text(JSON.stringify(c, null, 2), c);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "compare_tokens",
  {
    title: "Compare two tokens",
    description: "Run the health brief on two tokens and show which flags are shared and which differ.",
    inputSchema: { token_a: z.string(), token_b: z.string() },
  },
  async ({ token_a, token_b }) => {
    try {
      const c = await compareTokens(new CmcClient(), token_a, token_b);
      const t = [
        formatBrief(c.a),
        "",
        "----",
        "",
        formatBrief(c.b),
        "",
        `Shared flags: ${c.both.join(", ") || "none"}`,
        `Only ${token_a}: ${c.only_a.join(", ") || "none"}`,
        `Only ${token_b}: ${c.only_b.join(", ") || "none"}`,
      ].join("\n");
      return text(t, c);
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
