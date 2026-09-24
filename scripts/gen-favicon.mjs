// Generates src/app/favicon.ico from the real Eusate icon mark (public/brand/icon-gradient.svg),
// replacing the stock create-next-app default. Run manually with `node scripts/gen-favicon.mjs`;
// not wired into any build step. Re-run if the source SVG ever changes.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "src", "app", "favicon.ico");
const svgMarkup = fs.readFileSync(path.join(here, "..", "public", "brand", "icon-gradient.svg"), "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function renderPng(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px">${svgMarkup}</div>
  </body></html>`);
  await page.locator("svg").evaluate((el) => {
    el.style.width = "100%";
    el.style.height = "100%";
  });
  return page.screenshot({ omitBackground: true });
}

// A .ico can embed PNG-format frames directly (supported since Windows Vista, and by every
// browser that matters) - no need to hand-roll raw BMP data for each size.
function packIco(pngsBySize) {
  const count = pngsBySize.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = Buffer.alloc(16 * count);
  const images = [];
  let offset = 6 + 16 * count;
  pngsBySize.forEach(({ size, png }, i) => {
    const e = i * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, e); // width (0 means 256)
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    entries.writeUInt8(0, e + 2); // color count
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // planes
    entries.writeUInt16LE(32, e + 6); // bit count
    entries.writeUInt32LE(png.length, e + 8); // bytes in resource
    entries.writeUInt32LE(offset, e + 12); // offset
    offset += png.length;
    images.push(png);
  });

  return Buffer.concat([header, entries, ...images]);
}

const sizes = [16, 32, 48];
const pngsBySize = [];
for (const size of sizes) {
  pngsBySize.push({ size, png: await renderPng(size) });
  console.log(`rendered ${size}x${size}`);
}

fs.writeFileSync(OUT, packIco(pngsBySize));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${sizes.join(", ")}px)`);

await browser.close();
