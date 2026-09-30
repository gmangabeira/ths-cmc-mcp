// Renders demo/demo.mp4 from the REAL recorded CLI outputs in demo/outputs/.
// Deterministic: each frame is drawn for an exact time t, screenshotted, and piped to ffmpeg.
// Usage: node demo/render.mjs [--preview]   (preview = 6 fps, quick check)
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire("/Users/gabrielmangabeira/.nvm/versions/node/v23.11.0/lib/node_modules/@playwright/cli/");
const { chromium } = require("playwright-core");

const here = new URL(".", import.meta.url).pathname;
const read = (n) => readFileSync(`${here}outputs/${n}.txt`, "utf8").replace(/\n+$/, "");
const DATA = { sol: read("sol"), trump: read("trump"), smoke: read("smoke"), tests: read("tests") };

const PREVIEW = process.argv.includes("--preview");
const FPS = PREVIEW ? 6 : 24;
const TOTAL = 77;
const W = 1920, H = 1080;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;background:#071a2e;color:#e8f1f8;font-family:-apple-system,"Helvetica Neue",Inter,Arial,sans-serif;overflow:hidden;position:relative}
.scene{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 140px}
h1{font-size:104px;font-weight:800;letter-spacing:-2px;line-height:1.05}
h1 span{color:#1FB6FF}
.sub{font-size:44px;color:#9db8cc;margin-top:34px;line-height:1.35;max-width:1500px}
.tag{margin-top:54px;font-size:30px;letter-spacing:4px;color:#FFB800;text-transform:uppercase;font-weight:700}
.big{font-size:76px;font-weight:800;line-height:1.18;max-width:1500px}
.big em{font-style:normal;color:#FFB800}
.big b{color:#1FB6FF}
.term{position:absolute;left:80px;top:60px;width:1760px;height:820px;background:#0b2239;border:2px solid #1d3f5c;border-radius:18px;overflow:hidden;opacity:0}
.bar{height:46px;background:#10304d;display:flex;align-items:center;padding-left:20px;gap:10px}
.dot{width:14px;height:14px;border-radius:50%}
.pre{font-family:Menlo,"SF Mono",Consolas,monospace;font-size:19.5px;line-height:27px;padding:16px 26px;white-space:pre;color:#cfe0ee}
.l{display:block;transition:none}
.cmd{color:#7ee2a8}.call{color:#1FB6FF}.watch{color:#FFB800;font-weight:700}.dim{color:#7f9bb3}.key{color:#ffffff;font-weight:700}
.caption{position:absolute;left:0;right:0;bottom:0;height:170px;background:linear-gradient(180deg,rgba(7,26,46,0),#071a2e 55%);display:flex;align-items:center;justify-content:center;text-align:center;padding:30px 120px 20px;font-size:46px;font-weight:700;opacity:0}
.caption i{font-style:normal;color:#1FB6FF}.caption u{text-decoration:none;color:#FFB800}
.cursor{display:inline-block;width:11px;height:22px;background:#7ee2a8;vertical-align:-4px;margin-left:2px}
.foot{position:absolute;top:1010px;left:0;right:0;text-align:center;font-size:26px;color:#6f8ca5;opacity:0}
</style></head><body>

<div class="scene" id="s1">
  <h1>THS CMC <span>MCP</span></h1>
  <div class="sub">A live, sourced token health brief<br>for any AI assistant</div>
  <div class="tag">Build with CMC &middot; AI Agents and Automation</div>
</div>

<div class="scene" id="s2">
  <div class="big" id="s2a">Ask an AI if a token is risky.<br>It answers from <em>old data</em>.<br>No source. No field. <em>No trust.</em></div>
  <div class="big" id="s2b" style="position:absolute;opacity:0">This tool calls <b>CoinMarketCap live</b><br>and shows its work.</div>
</div>

<div class="term" id="term"><div class="bar"><div class="dot" style="background:#ff5f57"></div><div class="dot" style="background:#febc2e"></div><div class="dot" style="background:#28c840"></div><div style="margin-left:18px;color:#7f9bb3;font-size:20px">ths-cmc-mcp</div></div><div style="height:774px;overflow:hidden"><div class="pre" id="pre"></div></div></div>
<div class="caption" id="cap"></div>

<div class="scene" id="s6">
  <div class="big">Nine plain rules.<br>Every flag <b>cites its CMC field</b>.</div>
  <div class="sub" style="font-size:40px;margin-top:40px">github.com/gmangabeira/ths-cmc-mcp</div>
  <div class="sub" style="font-size:32px;margin-top:22px;color:#6f8ca5">Market-data signals only. Not the THS on-chain scan. Not financial advice.</div>
  <div class="tag">#BuildwithCMC &middot; tokenhealthscan.com</div>
</div>

<script>
const D = ${JSON.stringify(DATA)};
const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const clamp = (x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const fade = (t,a,b,fi=0.5,fo=0.5)=> clamp((t-a)/fi) * clamp((b-t)/fo);

function colorize(line){
  const e = esc(line);
  if (/^\\s+GET /.test(line)) return '<span class="call">'+e+'</span>';
  if (/\\[WATCH\\]|\\[HIGH\\]/.test(line)) return '<span class="watch">'+e+'</span>';
  if (/^\\s+from:/.test(line)) return '<span class="key">'+e+'</span>';
  if (/^\\s+rule:/.test(line)) return '<span class="dim">'+e+'</span>';
  if (/Market-data signals|CMC API calls|Response excerpt|Market mood|^Flags/.test(line)) return '<span class="dim">'+e+'</span>';
  if (/^(SMOKE PASS|ℹ pass|Flags: none)/.test(line)) return '<span class="cmd">'+e+'</span>';
  return e;
}

// Typed command then line-by-line output.
function termFrame(t0, t, cmd, out, opts){
  const cps = 13, typeEnd = t0 + 0.4 + cmd.length/cps;
  const n = Math.floor(clamp((t - t0 - 0.4)*cps, 0, cmd.length));
  let html = '<span class="l"><span class="cmd">$ '+esc(cmd.slice(0,n))+'</span>'+((t<typeEnd+0.2)?'<span class="cursor"></span>':'')+'</span>';
  const lines = out.split("\\n");
  const start = typeEnd + 0.5;
  const shown = t < start ? 0 : Math.min(lines.length, Math.floor((t-start)/opts.perLine)+1);
  for (let i=0;i<shown;i++){
    let cls = '';
    if (opts.focus && t >= opts.focusAt){
      cls = opts.focus(lines[i], i, lines) ? '' : ' style="opacity:.28"';
    }
    html += '<span class="l"'+cls+'>'+colorize(lines[i])+'</span>';
  }
  const availLines = 27; // visible terminal rows
  const total = 1 + shown;
  const scroll = Math.max(0, total - availLines) * 27;
  document.getElementById('pre').style.transform = 'translateY(' + (-scroll) + 'px)';
  return {html, doneAt: start + lines.length*opts.perLine};
}

const cap = (html, o)=>{ const c=document.getElementById('cap'); c.innerHTML='<span>'+html+'</span>'; c.style.opacity=o; };
const show = (id,o)=>{ document.getElementById(id).style.opacity=o; };

window.seek = function(t){
  // scenes
  show('s1', fade(t, 0, 5.5, 0.01, 0.6));
  show('s2', fade(t, 5.2, 13.4, 0.5, 0.6));
  show('s2a', t<9.8?1:clamp(1-(t-9.8)/0.5));
  show('s2b', clamp((t-10.2)/0.5));
  show('s6', fade(t, 68.6, 77, 0.6, 0.01));

  const term = document.getElementById('term'), pre = document.getElementById('pre');
  let to = 0, c = '', co = 0;

  if (t>=13 && t<30.6){ // SOL
    to = fade(t, 13, 30.6, 0.5, 0.6);
    const r = termFrame(13.6, t, "npm run cli -- brief SOL", D.sol, {perLine:0.16});
    pre.innerHTML = r.html;
    if (t < 18.2) c = 'Live call to the <i>CoinMarketCap Pro API</i>';
    else if (t < 25) c = 'Real calls, real status: <i>HTTP 200</i>, credits counted';
    else c = 'SOL is large and liquid. <u>No flags fire.</u>';
    co = fade(t, 15, 30.6, 0.4, 0.5);
  } else if (t>=30.6 && t<58.5){ // TRUMP
    to = fade(t, 30.6, 58.5, 0.5, 0.6);
    const focus = (l)=> /\\[WATCH\\]|rule:|from:/.test(l);
    const r = termFrame(31.2, t, "npm run cli -- brief TRUMP --context", D.trump, {perLine:0.17, focus, focusAt:43.5});
    pre.innerHTML = r.html;
    if (t < 43.5) c = 'Same tool, a different token';
    else if (t < 50) c = 'TRUMP fires <u>three flags</u>';
    else c = 'Each flag shows the <i>rule</i>, the <i>CMC fields</i>, and the <i>exact values</i>';
    co = fade(t, 38, 58.5, 0.4, 0.5);
  } else if (t>=58.5 && t<68.8){ // MCP + tests
    to = fade(t, 58.5, 68.8, 0.5, 0.6);
    const out = D.smoke + "\\n\\n" + D.tests;
    const r = termFrame(59.0, t, "npm run smoke && npm test", out, {perLine:0.27});
    pre.innerHTML = r.html;
    c = t < 64 ? 'Runs as an <i>MCP server</i> for Claude, Cursor, any MCP client' : '<u>19 tests</u> and a <u>live smoke test</u> pass';
    co = fade(t, 61, 68.8, 0.4, 0.5);
  }
  term.style.opacity = to;
  cap(c, co);
};
</script></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "/Users/gabrielmangabeira/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html);

const out = PREVIEW ? `${here}preview.mp4` : `${here}demo.mp4`;
const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
let ferr = "";
ff.stderr.on("data", (d) => (ferr += d));

const frames = Math.floor(TOTAL * FPS);
for (let i = 0; i < frames; i++) {
  const t = i / FPS;
  await page.evaluate((tt) => window.seek(tt), t);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 240 === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log("wrote", out);
mkdirSync(`${here}frames`, { recursive: true });
