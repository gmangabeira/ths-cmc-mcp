// Re-record test fixtures from the live CMC API. Needs CMC_API_KEY.
// Saves response data only. No key, no headers.
import { writeFileSync, mkdirSync } from "node:fs";
import { CmcClient } from "../src/cmc.ts";

const dir = new URL("../tests/fixtures/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const c = new CmcClient();

for (const s of ["SOL", "W"]) {
  const q = await c.get<any>("/v2/cryptocurrency/quotes/latest", { symbol: s, convert: "USD" });
  const rec = [...q.data[s]].sort((a: any, b: any) => (a.cmc_rank ?? 1e9) - (b.cmc_rank ?? 1e9))[0];
  const i = await c.get<any>("/v2/cryptocurrency/info", { id: String(rec.id) });
  const info = i.data[String(rec.id)];
  writeFileSync(
    `${dir}${s.toLowerCase()}.json`,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        note: "Real CMC responses, trimmed to one record.",
        quote: rec,
        info: { id: info.id, notice: info.notice, category: info.category, urls: { website: info.urls?.website } },
      },
      null,
      1,
    ),
  );
}
console.log("captured fixtures");
