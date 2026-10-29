import type { BrowserContext, Page } from "playwright";
import { parseGoogleCount } from "../parse/google.js";
import type { GoogleAdSource } from "../types.js";
import { jitter, newContext } from "./browser.js";

/** Lê quantos anúncios um domínio tem no Centro de Transparência do Google (no país da oferta). */
export class GoogleTransparencySource implements GoogleAdSource {
  name = "google-transparency-browser";
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  async countAdsForDomain(domain: string, region = "BR"): Promise<number | null> {
    if (!this.page) {
      this.ctx = await newContext("en-US");
      this.page = await this.ctx.newPage();
    }
    const page = this.page;
    const url = `https://adstransparency.google.com/?region=${encodeURIComponent(region)}&domain=${encodeURIComponent(domain)}`;
    // a contagem aparece depois de uma chamada assíncrona; se não vier, recarrega uma vez
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      for (let i = 0; i < 12; i++) {
        const count = parseGoogleCount(await page.evaluate(() => document.body?.innerText ?? "").catch(() => ""));
        if (count !== null) return count;
        await jitter(900, 1300);
      }
    }
    return null;
  }

  async close() {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
