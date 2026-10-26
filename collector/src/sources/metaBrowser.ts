import type { BrowserContext, Page } from "playwright";
import { parseMetaLibraryText } from "../parse/meta.js";
import type { KeywordResult, MetaAdSource } from "../types.js";
import { jitter, newContext, sleep } from "./browser.js";

export function metaLibraryUrl(term: string, country = "BR") {
  const q = encodeURIComponent(`"${term}"`);
  return (
    `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}` +
    `&q=${q}&search_type=keyword_exact_phrase&media_type=all` +
    `&sort_data[mode]=total_impressions&sort_data[direction]=desc`
  );
}

/** Robô próprio: abre a Biblioteca de Anúncios num navegador e lê os resultados. */
export class MetaBrowserSource implements MetaAdSource {
  name = "meta-browser";
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private opts: { scrolls?: number; country?: string } = {}) {}

  private async getPage() {
    if (!this.page) {
      this.ctx = await newContext("pt-BR");
      this.page = await this.ctx.newPage();
    }
    return this.page;
  }

  async searchKeyword(term: string): Promise<KeywordResult> {
    const page = await this.getPage();
    await page.goto(metaLibraryUrl(term, this.opts.country), { waitUntil: "domcontentloaded", timeout: 60_000 });

    // espera os cards aparecerem (ou desiste em 20s)
    await page.waitForFunction(
      () => document.body.innerText.includes("Identificação da biblioteca"),
      undefined,
      { timeout: 20_000 },
    ).catch(() => {});

    const scrolls = this.opts.scrolls ?? 6;
    for (let i = 0; i < scrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await jitter(1400, 2400);
    }
    await sleep(800);

    const text = await page.evaluate(() => document.body.innerText);
    if (/Faça login|Log in to continue|Entre no Facebook/i.test(text) && !text.includes("Identificação da biblioteca")) {
      throw new Error("A Meta pediu login para a busca — o IP do robô pode ter sido bloqueado.");
    }
    const { total, ads } = parseMetaLibraryText(text);
    return { keyword: term, totalResults: total, ads };
  }

  async close() {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
