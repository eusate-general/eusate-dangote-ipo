import type { RenderPage } from "./run";

const USER_AGENT = "EusateDangoteIPOGuide/1.0 (+https://dangoterefineryipo.eusate.com)";

/**
 * Renders a page with a real browser and returns its visible text. The official site is a JS
 * app; a plain fetch returns only a loading shell. The homepage times out under "networkidle"
 * (something on it keeps polling), so this uses "load" plus a fixed settle delay instead — that
 * combination is what worked in a manual check of the pages this watcher targets.
 */
export const renderWithPlaywright: RenderPage = async (url) => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { waitUntil: "load", timeout: 25_000 });
    await page.waitForTimeout(1500);
    return await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close();
  }
};
