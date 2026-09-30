// Thin CoinMarketCap Pro API client with a rate-limit guard and call evidence.
// The API key is read from the environment and is never logged or returned.

export const CMC_BASE = "https://pro-api.coinmarketcap.com";

export interface CallRecord {
  endpoint: string;
  params: Record<string, string>;
  status: number;
  credits: number | null;
  elapsed_ms: number;
  at: string;
}

export class CmcError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: number | null,
  ) {
    super(message);
  }
}

export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export interface CmcClientOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  /** Plan limit. The key used to build this tool allows 50 calls per minute. */
  maxPerMinute?: number;
}

export function keyFromEnv(): string | undefined {
  return process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY;
}

export class CmcClient {
  private apiKey?: string;
  private fetchImpl: FetchLike;
  private maxPerMinute: number;
  private stamps: number[] = [];
  readonly calls: CallRecord[] = [];

  constructor(opts: CmcClientOptions = {}) {
    this.apiKey = opts.apiKey ?? keyFromEnv();
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.maxPerMinute = opts.maxPerMinute ?? 45; // stay under 50
  }

  private async guard(): Promise<void> {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= this.maxPerMinute) {
      const wait = 60_000 - (now - this.stamps[0]) + 50;
      await new Promise((r) => setTimeout(r, wait));
    }
    this.stamps.push(Date.now());
  }

  async get<T = any>(endpoint: string, params: Record<string, string> = {}): Promise<{ data: T; call: CallRecord }> {
    if (!this.apiKey) {
      throw new CmcError("No API key. Set CMC_API_KEY (see .env.example).", 0, null);
    }
    const qs = new URLSearchParams(params).toString();
    const url = `${CMC_BASE}${endpoint}${qs ? `?${qs}` : ""}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      await this.guard();
      const t0 = Date.now();
      const res = await this.fetchImpl(url, {
        headers: { "X-CMC_PRO_API_KEY": this.apiKey, Accept: "application/json" },
      });
      const body: any = await res.json().catch(() => ({}));
      const status = body?.status ?? {};
      const call: CallRecord = {
        endpoint,
        params,
        status: res.status,
        credits: typeof status.credit_count === "number" ? status.credit_count : null,
        elapsed_ms: Date.now() - t0,
        at: new Date().toISOString(),
      };
      this.calls.push(call);

      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      // Some endpoints (v3 fear-and-greed) return error_code as the string "0", so compare as a number.
      const errCode = Number(status.error_code ?? 0);
      if (!res.ok || errCode !== 0) {
        const msg = status.error_message || `CMC returned HTTP ${res.status}`;
        throw new CmcError(msg, res.status, errCode || null);
      }
      return { data: body.data as T, call };
    }
    throw new CmcError("Rate limited by CMC. Try again in a minute.", 429, null);
  }
}
