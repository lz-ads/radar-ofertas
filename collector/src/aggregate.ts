import { offerKeyFor } from "./parse/meta.js";
import type { KeywordResult, MetaAd, OfferSnapshot } from "./types.js";

export interface AdWithMeta extends MetaAd {
  offerKey: string;
  keywords: string[];
}

/**
 * Ignorados: nome da página ("Shopee"), parceria de conteúdo de marca ("Fulana com L'Oréal Paris")
 * ou domínio ("hypera.com.br", vale para subdomínios).
 */
export function isIgnored(ad: Pick<MetaAd, "advertiser" | "domain">, ignored: Set<string>): boolean {
  const name = ad.advertiser.toLowerCase().trim();
  if (ignored.has(name)) return true;
  const parts = name.split(/\s+com\s+/);
  if (parts.length > 1 && parts.some((p) => ignored.has(p.trim()))) return true;
  const domain = ad.domain?.toLowerCase();
  if (domain) for (const i of ignored) if (i.includes(".") && !i.includes(" ") && (domain === i || domain.endsWith("." + i))) return true;
  return false;
}

/** Junta os resultados de todas as palavras-chave, sem repetir anúncio. */
export function mergeAds(results: KeywordResult[], ignored: Set<string>): AdWithMeta[] {
  const byId = new Map<string, AdWithMeta>();
  for (const r of results) {
    for (const ad of r.ads) {
      if (isIgnored(ad, ignored)) continue;
      const prev = byId.get(ad.libraryId);
      if (prev) {
        if (!prev.keywords.includes(r.keyword)) prev.keywords.push(r.keyword);
        prev.copies = Math.max(prev.copies, ad.copies);
        prev.landingUrl ??= ad.landingUrl;
        prev.pageUrl ??= ad.pageUrl;
        prev.thumbUrl ??= ad.thumbUrl;
      } else {
        byId.set(ad.libraryId, { ...ad, offerKey: offerKeyFor(ad), keywords: [r.keyword] });
      }
    }
  }
  return [...byId.values()];
}

/** Agrupa os anúncios por oferta e gera a foto do dia. */
export function buildSnapshots(ads: AdWithMeta[]): OfferSnapshot[] {
  const groups = new Map<string, AdWithMeta[]>();
  for (const ad of ads) {
    const g = groups.get(ad.offerKey) ?? [];
    g.push(ad);
    groups.set(ad.offerKey, g);
  }

  const snaps: OfferSnapshot[] = [];
  for (const [offerKey, list] of groups) {
    const copiesByAdv = new Map<string, number>();
    for (const a of list) copiesByAdv.set(a.advertiser, (copiesByAdv.get(a.advertiser) ?? 0) + a.copies);
    const advertisers = [...copiesByAdv.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n);
    const top = [...list].sort((x, y) => y.copies - x.copies)[0];
    const starts = list.map((a) => a.startDate).filter((d): d is string => !!d).sort();
    const domain = list.find((a) => a.domain && offerKey.startsWith("d:"))?.domain ?? null;
    const byCopies = [...list].sort((x, y) => y.copies - x.copies);
    const landing = byCopies.find((a) => a.landingUrl)?.landingUrl ?? null;
    const pageUrl = list.find((a) => a.advertiser === advertisers[0] && a.pageUrl)?.pageUrl ?? byCopies.find((a) => a.pageUrl)?.pageUrl ?? null;
    const thumb = byCopies.find((a) => a.thumbUrl)?.thumbUrl ?? null;

    snaps.push({
      offerKey,
      advertiser: advertisers[0],
      advertisers,
      domain: offerKey.startsWith("d:") ? offerKey.slice(2) : domain,
      cards: list.length,
      copies: list.reduce((s, a) => s + a.copies, 0),
      pages: advertisers.length,
      oldestStart: starts[0] ?? null,
      keywords: [...new Set(list.flatMap((a) => a.keywords))],
      sampleText: top.body.slice(0, 300),
      landingUrl: landing,
      pageUrl,
      thumbUrl: thumb,
    });
  }
  return snaps.sort((a, b) => b.copies + 2 * b.cards - (a.copies + 2 * a.cards));
}
