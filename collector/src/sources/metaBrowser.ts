import type { BrowserContext, Page } from "playwright";
import { CARD_LINKS_SCRIPT, cleanLandingUrl, cleanPageUrl, hostOf, type CardLinks } from "../parse/links.js";
import { isGenericDomain, parseMetaLibraryText } from "../parse/meta.js";
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

  constructor(private opts: { scrolls?: number; maxCards?: number; country?: string } = {}) {}

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
      () => !!document.body?.innerText?.includes("Identificação da biblioteca"),
      undefined,
      { timeout: 20_000 },
    ).catch(() => {});

    // rola até a página parar de carregar anúncios novos (ou até o limite)
    const maxScrolls = this.opts.scrolls ?? 25;
    const maxCards = this.opts.maxCards ?? 150;
    const countCards = () =>
      page.evaluate(() => (document.body?.innerText.match(/Identificação da biblioteca/g) || []).length).catch(() => 0);
    let last = await countCards();
    const start = last;
    let stale = 0;
    let rounds = 0;
    for (let i = 0; i < maxScrolls && last < maxCards && stale < 3; i++) {
      await page.mouse.wheel(0, 4000).catch(() => {});
      await page
        .evaluate(() => window.scrollTo(0, (document.scrollingElement ?? document.documentElement)?.scrollHeight ?? 0))
        .catch(() => {}); // a página pode estar recarregando; segue para a próxima rolagem
      await jitter(1600, 2600);
      let now = await countCards();
      if (now <= last) {
        // às vezes a lista para e mostra um botão "Ver mais" no fim
        const more = page.getByText(/^(Ver mais|See more|Carregar mais)$/).last();
        if (await more.isVisible().catch(() => false)) {
          await more.click({ timeout: 3000 }).catch(() => {});
          await jitter(1800, 2800);
          now = await countCards();
        }
      }
      rounds++;
      stale = now > last ? 0 : stale + 1;
      last = now;
    }
    await sleep(800);

    const text = await page.evaluate(() => document.body?.innerText ?? "");
    if (/Faça login|Log in to continue|Entre no Facebook/i.test(text) && !text.includes("Identificação da biblioteca")) {
      throw new Error("A Meta pediu login para a busca — o IP do robô pode ter sido bloqueado.");
    }
    const { total, ads } = parseMetaLibraryText(text);

    // links e mídia vêm do HTML (o texto não tem os endereços)
    const links = ((await page.evaluate(CARD_LINKS_SCRIPT).catch(() => ({}))) ?? {}) as CardLinks;
    for (const ad of ads) {
      const l = links[ad.libraryId];
      if (!l) continue;
      ad.pageUrl = cleanPageUrl(l.page);
      ad.landingUrl = cleanLandingUrl(l.landing);
      ad.thumbUrl = l.thumb;
      ad.mediaType = l.media;
      ad.videoUrl = l.video ?? null;
      // sem domínio no texto: usa o do link de destino
      if (!ad.domain || isGenericDomain(ad.domain)) {
        const host = hostOf(ad.landingUrl);
        if (host && !isGenericDomain(host)) ad.domain = host;
      }
    }
    const tail = text.replace(/\s+/g, " ").trim().slice(-240);
    return { keyword: term, totalResults: total, ads, scroll: { start, end: last, rounds, tail } };
  }

  async close() {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
