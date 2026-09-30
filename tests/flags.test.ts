import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeFlags } from "../src/flags.ts";
import { CmcClient } from "../src/cmc.ts";
import { tokenHealthBrief, formatBrief } from "../src/brief.ts";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

// Synthetic records for exact threshold checks
const synth = (over: Record<string, any> = {}, usd: Record<string, any> = {}) => ({
  num_market_pairs: 100,
  date_added: "2020-01-01T00:00:00.000Z",
  self_reported_market_cap: null,
  quote: { USD: { market_cap: 1_000_000, fully_diluted_market_cap: 1_000_000, volume_24h: 100_000, dex_volume_24h: 0, percent_change_7d: 1, ...usd } },
  ...over,
});
const ids = (q: any, info?: any) => computeFlags({ quote: q, info, now: new Date("2026-09-30") }).flags.map((f) => f.id);

test("healthy synthetic token fires nothing", () => assert.deepEqual(ids(synth()), []));
test("FDV 3x market cap fires fdv_gap (watch), 10x is high", () => {
  const w = computeFlags({ quote: synth({}, { fully_diluted_market_cap: 3_000_000 }) }).flags[0];
  assert.equal(w.id, "fdv_gap");
  assert.equal(w.severity, "watch");
  assert.equal(computeFlags({ quote: synth({}, { fully_diluted_market_cap: 10_000_000 }) }).flags[0].severity, "high");
});
test("thin trading under 1% of market cap", () => assert.ok(ids(synth({}, { volume_24h: 5_000 })).includes("thin_trading")));
test("heavy volume over 50% of market cap", () => assert.ok(ids(synth({}, { volume_24h: 600_000 })).includes("heavy_volume")));
test("few venues under 10 pairs", () => assert.ok(ids(synth({ num_market_pairs: 4 })).includes("few_venues")));
test("young token under 90 days", () => assert.ok(ids(synth({ date_added: "2026-08-20T00:00:00.000Z" })).includes("young_token")));
test("sharp 7d drop", () => assert.ok(ids(synth({}, { percent_change_7d: -35 })).includes("sharp_drop")));
test("supply mismatch when self-reported cap is 50% off", () => assert.ok(ids(synth({ self_reported_market_cap: 1_500_000 })).includes("supply_mismatch")));
test("dex heavy volume", () => assert.ok(ids(synth({}, { dex_volume_24h: 95_000 })).includes("dex_heavy")));
test("CMC notice is shown as info, never scored high", () => {
  const f = computeFlags({ quote: synth(), info: { notice: "Some note" } }).flags.find((x) => x.id === "cmc_notice")!;
  assert.equal(f.severity, "info");
});
test("missing fields are reported, not guessed", () => {
  const r = computeFlags({ quote: { quote: { USD: {} } } });
  assert.ok(r.notAvailable.length >= 3);
  assert.deepEqual(r.flags, []);
});
test("every flag names the fields and values it came from", () => {
  const { flags } = computeFlags({ quote: synth({}, { fully_diluted_market_cap: 9_000_000, volume_24h: 500 }) });
  assert.ok(flags.length >= 2);
  for (const f of flags) {
    assert.ok(f.fields.length > 0 && Object.keys(f.values).length > 0 && f.rule.length > 0);
  }
});

// Real recorded responses
test("recorded SOL response: no flags (large, liquid token)", () => {
  const { quote, info } = fx("sol");
  assert.deepEqual(computeFlags({ quote, info, now: new Date("2026-09-30") }).flags, []);
});
test("recorded TRUMP response: fdv_gap, heavy_volume, supply_mismatch fire", () => {
  const { quote, info } = fx("trump");
  const got = computeFlags({ quote, info, now: new Date("2026-09-30") }).flags.map((f) => f.id);
  for (const want of ["fdv_gap", "heavy_volume", "supply_mismatch"]) assert.ok(got.includes(want), `missing ${want}`);
});

// Full pipeline with an injected fetch (no network)
test("brief pipeline: symbol lookup builds a brief from mocked CMC responses", async () => {
  const { quote, info } = fx("trump");
  const fetchImpl = async (url: string) => {
    const body = url.includes("/quotes/latest")
      ? { status: { error_code: 0, credit_count: 1 }, data: { TRUMP: [quote] } }
      : { status: { error_code: 0, credit_count: 1 }, data: { [String(quote.id)]: info } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const client = new CmcClient({ apiKey: "test-key-not-real", fetchImpl });
  const b = await tokenHealthBrief(client, "trump");
  assert.equal(b.found, true);
  if (b.found) {
    assert.equal(b.token.symbol, "TRUMP");
    assert.equal(b.evidence.calls.length, 2);
    assert.match(formatBrief(b), /Not the Token Health Scan on-chain scan/);
  }
});
test("brief pipeline: unknown token returns a clear not-found", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ status: { error_code: 0 }, data: {} }), { status: 200 });
  const r = await tokenHealthBrief(new CmcClient({ apiKey: "test-key-not-real", fetchImpl }), "ZZZNOPE");
  assert.equal(r.found, false);
});
test("client treats a string error_code of \"0\" as success", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: { error_code: "0", credit_count: 1 }, data: { value: 55 } }), { status: 200 });
  const r = await new CmcClient({ apiKey: "test-key-not-real", fetchImpl }).get("/v3/fear-and-greed/latest");
  assert.equal((r.data as any).value, 55);
});
test("client raises on a real CMC error code", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: { error_code: 1006, error_message: "plan" } }), { status: 403 });
  await assert.rejects(() => new CmcClient({ apiKey: "test-key-not-real", fetchImpl }).get("/x"), /plan/);
});
test("client refuses to run without a key", async () => {
  const prev = { a: process.env.CMC_API_KEY, b: process.env.COINMARKETCAP_API_KEY };
  delete process.env.CMC_API_KEY;
  delete process.env.COINMARKETCAP_API_KEY;
  await assert.rejects(() => new CmcClient().get("/v1/key/info"), /No API key/);
  if (prev.a) process.env.CMC_API_KEY = prev.a;
  if (prev.b) process.env.COINMARKETCAP_API_KEY = prev.b;
});
