// Generates public/icons/ from the real Eusate icon mark (public/brand/icon-gradient.svg,
// extracted from the official logo at eusate.com/logos/full-gradient-black.svg — same gradient,
// #D7AB07 -> #E86555). Run manually with `node scripts/gen-icons.mjs`; not wired into any build
// step. Re-run if the source SVG ever changes.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "public", "icons");
const svgMarkup = fs.readFileSync(path.join(here, "..", "public", "brand", "icon-gradient.svg"), "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function render(size, file, { pad = 0 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad}px">${svgMarkup}</div>
  </body></html>`);
  await page.locator("svg").evaluate((el) => {
    el.style.width = "100%";
    el.style.height = "100%";
  });
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
  console.log("wrote", file);
}

await render(512, "icon-512.png");
await render(192, "icon-192.png");
// Maskable needs the mark inside a ~40% safe-area circle, so pad it in from the edges.
await render(512, "icon-512-maskable.png", { pad: 96 });

await browser.close();
