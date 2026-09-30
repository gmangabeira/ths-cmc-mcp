// Builds demo/demo.mp4 (v2): voiceover-synced scenes, charts from the real recorded numbers,
// a real Claude Code session, real screenshots, burned-in captions.
// Inputs (all real, recorded 2026-09-30): demo/outputs/*.txt, demo/outputs/claude-session.json,
// demo/work/shots/*.png, demo/work/vo/*.mp3.   Usage: node demo/render2.mjs [--preview]
import { readFileSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire("/Users/gabrielmangabeira/.nvm/versions/node/v23.11.0/lib/node_modules/@playwright/cli/");
const { chromium } = require("playwright-core");

const here = new URL(".", import.meta.url).pathname;
const PREVIEW = process.argv.includes("--preview");
const FPS = PREVIEW ? 6 : 24;
const W = 1920, H = 1080;
const txt = (n) => readFileSync(`${here}outputs/${n}.txt`, "utf8");

// ---- real numbers parsed from the recorded CLI outputs ----
const num = (s, re) => Number(s.match(re)[1].replace(/,/g, ""));
const solT = txt("sol"), trT = txt("w");
const sol = {
  mcap: num(solT, /"quote\.USD\.market_cap": ([\d.]+)/),
  fdv: num(solT, /"quote\.USD\.fully_diluted_market_cap": ([\d.]+)/),
  vol: num(solT, /"quote\.USD\.volume_24h": ([\d.]+)/),
};
const tok = {
  mcap: num(trT, /"quote\.USD\.market_cap": ([\d.]+)/),
  fdv: num(trT, /"quote\.USD\.fully_diluted_market_cap": ([\d.]+)/),
  vol: num(trT, /"quote\.USD\.volume_24h": ([\d.]+)/),
  self: num(trT, /self_reported_market_cap=([\d,.]+)/),
};
const lines = trT.split("\n");
const fi = lines.findIndex((l) => l.startsWith("Flags ("));
const flagLines = [];
for (let i = fi; i < lines.length && lines[i].trim() !== ""; i++) flagLines.push(lines[i]);

// ---- real Claude Code session ----
const session = JSON.parse(readFileSync(`${here}outputs/claude-session.json`, "utf8"));

// ---- scenes synced to the voiceover ----
const VO = {
  s1: "Ask an AI if a token is risky, and it answers from memory. No source. No proof.",
  s2: "I built an MCP server that calls CoinMarketCap live, and shows its work.",
  s3: "Here it is inside Claude Code. I ask if Wormhole is risky. Claude calls my tools, hits the CoinMarketCap API, and answers from live data.",
  s4: "The numbers tell the story. Wormhole trades eighty-eight percent of its market cap in a single day. SOL trades about six percent. CoinMarketCap's market cap for Wormhole is more than double what the project reports. And the fully diluted gap stays under the three-times line, so that flag stays quiet.",
  s5: "Every flag shows the rule, the CoinMarketCap field, and the exact values. Nothing is guessed.",
  s6: "Nine plain rules. Nineteen tests. A live smoke test against the real API. All open source.",
  s8: "Market-data signals only. The full on-chain scan lives at Token Health Scan. The repo is on GitHub.",
};
const MIN = { s1: 6.8, s2: 7.0, s3: 14.0, s4: 19.8, s5: 8.4, s6: 8.6, s8: 8.8 };
const LEAD = 0.3;
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

let start = 0;
const scenes = Object.keys(VO).map((id) => {
  const mp3 = `${here}work/vo/${id}.mp3`;
  if (!existsSync(mp3)) throw new Error("missing voiceover " + mp3);
  const a = dur(mp3);
  const d = Math.max(MIN[id], a + LEAD + 0.8);
  // captions: split by sentence, timed by character share of the audio
  const sents = VO[id].match(/[^.!?]+[.!?]+/g).map((s) => s.trim());
  const total = sents.reduce((n, s) => n + s.length, 0);
  let acc = 0;
  const chunks = sents.map((s) => {
    const t0 = LEAD + (acc / total) * a;
    acc += s.length;
    return { text: s, t0, t1: LEAD + (acc / total) * a + 0.25 };
  });
  const sc = { id, start, dur: d, audio: a, mp3, chunks };
  start += d;
  return sc;
});
const TOTAL = start;

const DATA = {
  scenes: scenes.map(({ id, start, dur, chunks }) => ({ id, start, dur, chunks })),
  total: TOTAL,
  sol, tok, tokName: "Wormhole", tokSym: "W", session, flagLines,
  shots: { repo: `file://${here}work/shots/repo.png`, ths: `file://${here}work/shots/ths.png` },
};
console.log("scenes:", scenes.map((s) => `${s.id} ${s.start.toFixed(1)}+${s.dur.toFixed(1)}`).join(" | "), "total", TOTAL.toFixed(1));

// ---- frames ----
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ||
    "/Users/gabrielmangabeira/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.addInitScript((d) => { window.DATA = d; }, DATA);
await page.goto(`file://${here}player.html`);
await page.waitForTimeout(400);

const silent = `${here}work/silent.mp4`;
const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "19", silent], { stdio: ["pipe", "ignore", "pipe"] });
ff.stderr.on("data", () => {});
const frames = Math.floor(TOTAL * FPS);
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.seek(t), i / FPS);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 300 === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();

// ---- mux voiceover ----
const out = PREVIEW ? `${here}work/preview2.mp4` : `${here}demo.mp4`;
const args = ["-y", "-i", silent];
scenes.forEach((s) => args.push("-i", s.mp3));
const fc = scenes.map((s, i) => `[${i + 1}:a]adelay=${Math.round((s.start + LEAD) * 1000)}|${Math.round((s.start + LEAD) * 1000)}[a${i}]`).join(";") +
  ";" + scenes.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${scenes.length}:normalize=0,volume=1.6,apad,atrim=0:${TOTAL.toFixed(2)}[aout]`;
args.push("-filter_complex", fc, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out);
execFileSync("ffmpeg", args, { stdio: "ignore" });
console.log("wrote", out, TOTAL.toFixed(1) + "s");
