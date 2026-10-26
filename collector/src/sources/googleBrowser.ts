import type { BrowserContext, Page } from "playwright";
import { parseGoogleCount } from "../parse/google.js";
import type { GoogleAdSource } from "../types.js";
import { jitter, newContext } from "./browser.js";

/** Lê quantos anúncios um domínio tem no Centro de Transparência do Google (Brasil). */
export class GoogleTransparencySource implements GoogleAdSource {
  name = "google-transparency-browser";
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  async countAdsForDomain(domain: string): Promise<number | null> {
    if (!this.page) {
      this.ctx = await newContext("en-US");
      this.page = await this.ctx.newPage();
    }
    const page = this.page;
    await page.goto(`https://adstransparency.google.com/?region=BR&domain=${encodeURIComponent(domain)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    // a contagem aparece depois de uma chamada assíncrona
    let count: number | null = null;
    for (let i = 0; i < 8 && count === null; i++) {
      await jitter(900, 1300);
      count = parseGoogleCount(await page.evaluate(() => document.body.innerText));
    }
    return count;
  }

  async close() {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
