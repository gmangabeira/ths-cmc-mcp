// Rule-based flags. Every flag names the CMC field and the value it came from.
// These are market-data signals. They are rules of thumb, not findings or advice.

export type Severity = "info" | "watch" | "high";

export interface Flag {
  id: string;
  severity: Severity;
  title: string;
  rule: string;
  fields: string[];
  values: Record<string, number | string | null>;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface FlagInput {
  /** One record from /v2/cryptocurrency/quotes/latest */
  quote: any;
  /** One record from /v2/cryptocurrency/info (optional) */
  info?: any;
  now?: Date;
}

export function computeFlags({ quote, info, now = new Date() }: FlagInput): { flags: Flag[]; notAvailable: string[] } {
  const flags: Flag[] = [];
  const notAvailable: string[] = [];
  const usd = quote?.quote?.USD ?? {};

  const mcap = num(usd.market_cap);
  const fdv = num(usd.fully_diluted_market_cap);
  const vol = num(usd.volume_24h);
  const dexVol = num(usd.dex_volume_24h);
  const d7 = num(usd.percent_change_7d);
  const pairs = num(quote?.num_market_pairs);
  const selfMcap = num(quote?.self_reported_market_cap);

  // 1. FDV gap
  if (mcap && fdv) {
    const ratio = fdv / mcap;
    if (ratio >= 3) {
      flags.push({
        id: "fdv_gap",
        severity: ratio >= 10 ? "high" : "watch",
        title: "Large gap between market cap and fully diluted value",
        rule: "fully_diluted_market_cap is 3x or more of market_cap (10x or more = high)",
        fields: ["quote.USD.fully_diluted_market_cap", "quote.USD.market_cap"],
        values: { fully_diluted_market_cap: fdv, market_cap: mcap, ratio: Number(ratio.toFixed(2)) },
      });
    }
  } else notAvailable.push("fdv_gap (market_cap or fully_diluted_market_cap missing)");

  // 2 and 3. Volume relative to market cap
  if (mcap && vol !== null) {
    const r = vol / mcap;
    if (r < 0.01) {
      flags.push({
        id: "thin_trading",
        severity: r < 0.001 ? "high" : "watch",
        title: "Thin trading for its size",
        rule: "volume_24h is under 1% of market_cap (under 0.1% = high)",
        fields: ["quote.USD.volume_24h", "quote.USD.market_cap"],
        values: { volume_24h: vol, market_cap: mcap, volume_to_mcap_pct: Number((r * 100).toFixed(3)) },
      });
    } else if (r > 0.5) {
      flags.push({
        id: "heavy_volume",
        severity: "watch",
        title: "Unusually heavy trading for its size",
        rule: "volume_24h is over 50% of market_cap",
        fields: ["quote.USD.volume_24h", "quote.USD.market_cap"],
        values: { volume_24h: vol, market_cap: mcap, volume_to_mcap_pct: Number((r * 100).toFixed(1)) },
      });
    }
  } else notAvailable.push("volume checks (volume_24h or market_cap missing)");

  // 4. Self-reported vs CMC market cap
  if (mcap && selfMcap) {
    const diff = Math.abs(selfMcap - mcap) / mcap;
    if (diff > 0.25) {
      flags.push({
        id: "supply_mismatch",
        severity: "watch",
        title: "Project-reported market cap differs from CMC's",
        rule: "self_reported_market_cap differs from market_cap by more than 25%",
        fields: ["self_reported_market_cap", "quote.USD.market_cap"],
        values: { self_reported_market_cap: selfMcap, market_cap: mcap, difference_pct: Number((diff * 100).toFixed(1)) },
      });
    }
  }

  // 5. Few venues
  if (pairs !== null) {
    if (pairs < 10) {
      flags.push({
        id: "few_venues",
        severity: "watch",
        title: "Listed on few market pairs",
        rule: "num_market_pairs is under 10",
        fields: ["num_market_pairs"],
        values: { num_market_pairs: pairs },
      });
    }
  } else notAvailable.push("few_venues (num_market_pairs missing)");

  // 6. DEX-heavy volume
  if (vol && dexVol !== null && vol > 0) {
    const share = dexVol / vol;
    if (share > 0.8) {
      flags.push({
        id: "dex_heavy",
        severity: "info",
        title: "Trading happens almost only on DEXs",
        rule: "dex_volume_24h is over 80% of volume_24h",
        fields: ["quote.USD.dex_volume_24h", "quote.USD.volume_24h"],
        values: { dex_volume_24h: dexVol, volume_24h: vol, dex_share_pct: Number((share * 100).toFixed(1)) },
      });
    }
  }

  // 7. Young token
  const added = quote?.date_added ? new Date(quote.date_added) : null;
  if (added && !Number.isNaN(added.getTime())) {
    const days = Math.floor((now.getTime() - added.getTime()) / 86_400_000);
    if (days < 90) {
      flags.push({
        id: "young_token",
        severity: days < 30 ? "high" : "watch",
        title: "Recently listed",
        rule: "date_added is under 90 days ago (under 30 = high)",
        fields: ["date_added"],
        values: { date_added: quote.date_added, age_days: days },
      });
    }
  } else notAvailable.push("young_token (date_added missing)");

  // 8. Sharp 7d drop
  if (d7 !== null) {
    if (d7 < -30) {
      flags.push({
        id: "sharp_drop",
        severity: d7 < -50 ? "high" : "watch",
        title: "Sharp drop over 7 days",
        rule: "percent_change_7d is below -30% (below -50% = high)",
        fields: ["quote.USD.percent_change_7d"],
        values: { percent_change_7d: Number(d7.toFixed(2)) },
      });
    }
  } else notAvailable.push("sharp_drop (percent_change_7d missing)");

  // 9. CMC notice
  const notice = typeof info?.notice === "string" ? info.notice.trim() : "";
  if (notice) {
    flags.push({
      id: "cmc_notice",
      severity: "info",
      title: "CoinMarketCap shows a notice on this token (read it, it may be harmless)",
      rule: "info.notice contains text. Shown for awareness only, not scored as a risk.",
      fields: ["info.notice"],
      values: { notice: notice.slice(0, 280) },
    });
  }

  const order: Record<Severity, number> = { high: 0, watch: 1, info: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return { flags, notAvailable };
}
