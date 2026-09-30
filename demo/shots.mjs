// Takes real screenshots used in the demo video. Output: demo/work/shots/*.png
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/Users/gabrielmangabeira/.nvm/versions/node/v23.11.0/lib/node_modules/@playwright/cli/");
const { chromium } = require("playwright-core");

const out = new URL("./work/shots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ||
    "/Users/gabrielmangabeira/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

await page.goto("https://github.com/gmangabeira/ths-cmc-mcp", { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}repo.png` });
await page.goto("https://github.com/gmangabeira/ths-cmc-mcp/blob/main/README.md", { waitUntil: "networkidle" });
await page.evaluate(() => window.scrollTo(0, 620));
await page.screenshot({ path: `${out}readme.png` });
await page.goto("https://tokenhealthscan.com", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}ths.png` });
await browser.close();
console.log("shots saved");
