// Live smoke test: real CMC calls through the real MCP server over stdio.
// Needs CMC_API_KEY. Uses about 10 credits.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", new URL("../src/server.ts", import.meta.url).pathname],
  env: { ...(process.env as Record<string, string>) },
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
console.log("tools:", tools.join(", "));
assert.deepEqual(tools, ["compare_tokens", "market_context", "token_health_brief"]);

const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

for (const token of ["SOL", "W"]) {
  const r: any = await client.callTool({ name: "token_health_brief", arguments: { token } });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /Not the Token Health Scan on-chain scan/);
  assert.equal(r.structuredContent.found, true);
  console.log(`OK token_health_brief ${token}: ${r.structuredContent.flags.length} flag(s), ${r.structuredContent.evidence.calls.length} CMC call(s)`);
}

const ctx: any = await client.callTool({ name: "market_context", arguments: {} });
assert.ok(!ctx.isError);
assert.equal(typeof ctx.structuredContent.fear_greed?.value, "number", "fear_greed must be a real number");
assert.ok(ctx.structuredContent.global?.total_market_cap_usd > 0, "global market cap must be positive");
console.log("OK market_context: fear & greed =", ctx.structuredContent.fear_greed?.value, ctx.structuredContent.fear_greed?.classification);

const nf: any = await client.callTool({ name: "token_health_brief", arguments: { token: "ZZZNOPE" } });
assert.equal(nf.structuredContent.found, false);
console.log("OK unknown token returns a clean not-found");

const cmp: any = await client.callTool({ name: "compare_tokens", arguments: { token_a: "SOL", token_b: "W" } });
assert.ok(!cmp.isError);
console.log("OK compare_tokens: only W flags =", cmp.structuredContent.only_b.join(", "));

await client.close();
console.log("SMOKE PASS");
