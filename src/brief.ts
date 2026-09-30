import { CmcClient, CmcError, type CallRecord } from "./cmc.ts";
import { computeFlags, type Flag } from "./flags.ts";

export const DISCLAIMER =
  "Market-data signals from CoinMarketCap. Not the Token Health Scan on-chain scan. Not financial advice.";

export interface Brief {
  found: true;
  token: {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    rank: number | null;
    category: string | null;
    date_added: string | null;
    contract_address: string | null;
    website: string | null;
  };
  market: Record<string, number | null>;
  supply: Record<string, number | null>;
  flags: Flag[];
  not_available: string[];
  context?: MarketContext;
  evidence: { calls: CallRecord[]; excerpt: Record<string, unknown> };
  disclaimer: string;
}

export interface NotFound {
  found: false;
  query: string;
  message: string;
}

export interface MarketContext {
  fear_greed: { value: number; classification: string; updated: string } | null;
  global: {
    total_market_cap_usd: number | null;
    total_volume_24h_usd: number | null;
    btc_dominance: number | null;
    eth_dominance: number | null;
  } | null;
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const isAddress = (q: string) => /^0x[0-9a-fA-F]{40}$/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

/** Pick the best record for a symbol: the one with the lowest CMC rank. */
function bestBySymbol(records: any[]): any | undefined {
  return [...records]
    .filter((r) => r && r.is_active !== 0)
    .sort((a, b) => (a.cmc_rank ?? 1e9) - (b.cmc_rank ?? 1e9))[0];
}

export async function tokenHealthBrief(
  client: CmcClient,
  query: string,
  opts: { includeContext?: boolean } = {},
): Promise<Brief | NotFound> {
  const q = query.trim();
  if (!q) return { found: false, query, message: "Give me a token symbol or a contract address." };

  let quote: any;
  let info: any;

  try {
    if (isAddress(q)) {
      // CMC rejects checksummed (mixed-case) EVM addresses with a confusing 400. Lowercase works.
      const { data } = await client.get<Record<string, any>>("/v2/cryptocurrency/info", {
        address: q.startsWith("0x") ? q.toLowerCase() : q,
        skip_invalid: "true",
      });
      info = first(Object.values(data ?? {}) as any[]);
      if (!info) return { found: false, query, message: `No CMC listing found for address ${q}.` };
      const res = await client.get<Record<string, any>>("/v2/cryptocurrency/quotes/latest", {
        id: String(info.id),
        convert: "USD",
      });
      quote = first(res.data?.[String(info.id)]);
    } else {
      const sym = q.toUpperCase();
      const res = await client.get<Record<string, any[]>>("/v2/cryptocurrency/quotes/latest", {
        symbol: sym,
        convert: "USD",
        skip_invalid: "true",
      });
      quote = bestBySymbol(res.data?.[sym] ?? []);
      if (!quote) return { found: false, query, message: `No CMC listing found for symbol ${sym}.` };
      const infoRes = await client.get<Record<string, any>>("/v2/cryptocurrency/info", { id: String(quote.id) });
      info = first(infoRes.data?.[String(quote.id)]);
    }
  } catch (e) {
    if (e instanceof CmcError && (e.code === 400 || e.status === 400)) {
      return { found: false, query, message: `CMC could not match "${q}": ${e.message}` };
    }
    throw e;
  }

  if (!quote) return { found: false, query, message: `No CMC quote returned for "${q}".` };

  const usd = quote.quote?.USD ?? {};
  const { flags, notAvailable } = computeFlags({ quote, info });

  const brief: Brief = {
    found: true,
    token: {
      id: quote.id,
      name: quote.name,
      symbol: quote.symbol,
      slug: quote.slug,
      rank: quote.cmc_rank ?? null,
      category: info?.category ?? null,
      date_added: quote.date_added ?? null,
      contract_address: info?.contract_address?.[0]?.contract_address ?? null,
      website: info?.urls?.website?.[0] ?? null,
    },
    market: {
      price_usd: usd.price ?? null,
      market_cap_usd: usd.market_cap ?? null,
      fully_diluted_market_cap_usd: usd.fully_diluted_market_cap ?? null,
      volume_24h_usd: usd.volume_24h ?? null,
      cex_volume_24h_usd: usd.cex_volume_24h ?? null,
      dex_volume_24h_usd: usd.dex_volume_24h ?? null,
      tvl_usd: usd.tvl ?? null,
      percent_change_24h: usd.percent_change_24h ?? null,
      percent_change_7d: usd.percent_change_7d ?? null,
      percent_change_30d: usd.percent_change_30d ?? null,
      num_market_pairs: quote.num_market_pairs ?? null,
    },
    supply: {
      circulating: quote.circulating_supply ?? null,
      total: quote.total_supply ?? null,
      max: quote.max_supply ?? null,
      self_reported_market_cap_usd: quote.self_reported_market_cap ?? null,
    },
    flags,
    not_available: notAvailable,
    evidence: {
      calls: [...client.calls],
      excerpt: {
        "quotes/latest": {
          id: quote.id,
          symbol: quote.symbol,
          cmc_rank: quote.cmc_rank,
          num_market_pairs: quote.num_market_pairs,
          "quote.USD.market_cap": usd.market_cap,
          "quote.USD.fully_diluted_market_cap": usd.fully_diluted_market_cap,
          "quote.USD.volume_24h": usd.volume_24h,
          "quote.USD.percent_change_7d": usd.percent_change_7d,
        },
      },
    },
    disclaimer: DISCLAIMER,
  };

  if (opts.includeContext) brief.context = await marketContext(client);
  return brief;
}

export async function marketContext(client: CmcClient): Promise<MarketContext> {
  const out: MarketContext = { fear_greed: null, global: null };
  try {
    const { data } = await client.get<any>("/v3/fear-and-greed/latest");
    if (data) out.fear_greed = { value: data.value, classification: data.value_classification, updated: data.update_time };
  } catch (e) {
    if (!(e instanceof CmcError)) throw e;
  }
  try {
    const { data } = await client.get<any>("/v1/global-metrics/quotes/latest");
    const usd = data?.quote?.USD ?? {};
    out.global = {
      total_market_cap_usd: usd.total_market_cap ?? null,
      total_volume_24h_usd: usd.total_volume_24h ?? null,
      btc_dominance: data?.btc_dominance ?? null,
      eth_dominance: data?.eth_dominance ?? null,
    };
  } catch (e) {
    if (!(e instanceof CmcError)) throw e;
  }
  return out;
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "n/a"
    : n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(2)}M`
        : n >= 1
          ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
          : `$${n.toPrecision(3)}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n.toFixed(1)}%`);

export function formatBrief(b: Brief | NotFound): string {
  if (!b.found) return b.message;
  const m = b.market;
  const lines = [
    `${b.token.name} (${b.token.symbol})  rank ${b.token.rank ?? "n/a"}  listed ${b.token.date_added?.slice(0, 10) ?? "n/a"}`,
    `Price ${money(m.price_usd)}   Market cap ${money(m.market_cap_usd)}   FDV ${money(m.fully_diluted_market_cap_usd)}`,
    `Volume 24h ${money(m.volume_24h_usd)}   DEX volume ${money(m.dex_volume_24h_usd)}   Pairs ${m.num_market_pairs ?? "n/a"}`,
    `Change 24h ${pct(m.percent_change_24h)}   7d ${pct(m.percent_change_7d)}   30d ${pct(m.percent_change_30d)}`,
    "",
  ];
  if (b.flags.length === 0) {
    lines.push("Flags: none fired on the nine market-data rules.");
  } else {
    lines.push(`Flags (${b.flags.length}):`);
    for (const f of b.flags) {
      const vals = Object.entries(f.values)
        .map(([k, v]) => `${k}=${typeof v === "number" ? v.toLocaleString("en-US") : v}`)
        .join(", ");
      lines.push(`  [${f.severity.toUpperCase()}] ${f.title}`, `      rule: ${f.rule}`, `      from: ${vals}`);
    }
  }
  if (b.not_available.length) lines.push("", `Not available: ${b.not_available.join("; ")}`);
  if (b.context?.fear_greed) {
    lines.push("", `Market mood: Fear & Greed ${b.context.fear_greed.value} (${b.context.fear_greed.classification})`);
  }
  lines.push("", b.disclaimer);
  return lines.join("\n");
}

export async function compareTokens(client: CmcClient, a: string, b: string) {
  const [x, y] = [await tokenHealthBrief(client, a), await tokenHealthBrief(client, b)];
  const ids = (br: Brief | NotFound) => (br.found ? br.flags.map((f) => f.id) : []);
  const ax = new Set(ids(x));
  const by = new Set(ids(y));
  return {
    a: x,
    b: y,
    only_a: [...ax].filter((i) => !by.has(i)),
    only_b: [...by].filter((i) => !ax.has(i)),
    both: [...ax].filter((i) => by.has(i)),
    disclaimer: DISCLAIMER,
  };
}
