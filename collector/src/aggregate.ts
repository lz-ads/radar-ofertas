import { destTypeFor, isGenericDomain, normalizeName, offerKeyFor } from "./parse/meta.js";
import type { DestType, KeywordResult, MetaAd, OfferSnapshot } from "./types.js";

export interface AdWithMeta extends MetaAd {
  offerKey: string;
  keywords: string[];
}

/** Apelido: chave antiga ("a:anunciante") que passou a apontar para a oferta com site ("d:site.com"). */
export interface OfferAlias {
  alias: string;
  target: string;
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
        prev.cta ??= ad.cta;
      } else {
        const a: AdWithMeta = { ...ad, offerKey: offerKeyFor(ad), keywords: [r.keyword] };
        // card sem link mas com domínio próprio: usa a página inicial do domínio
        if (!a.landingUrl && a.domain && !isGenericDomain(a.domain)) a.landingUrl = `https://${a.domain}/`;
        a.destType = destTypeFor(a);
        byId.set(ad.libraryId, a);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Junta ofertas duplicadas: anúncios sem site ("a:...") do mesmo anunciante ou da mesma página
 * do Facebook passam para a oferta com site, quando ela é clara (um site domina as cópias).
 * `hints` vem do banco: anunciante -> chave com site vista em coletas anteriores.
 */
export function resolveOfferKeys(ads: AdWithMeta[], hints: Map<string, string> = new Map()): OfferAlias[] {
  const byName = new Map<string, Map<string, number>>();
  const byPage = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, k: string | null | undefined, key: string, w: number) => {
    if (!k) return;
    const inner = m.get(k) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + w);
    m.set(k, inner);
  };
  for (const a of ads) {
    if (!a.offerKey.startsWith("d:")) continue;
    add(byName, normalizeName(a.advertiser), a.offerKey, a.copies);
    add(byPage, a.pageUrl, a.offerKey, a.copies);
  }
  const dominant = (m: Map<string, number> | undefined): string | null => {
    if (!m || !m.size) return null;
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    const [key, n] = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    return n / total >= 0.7 ? key : null; // anunciante com vários sites diferentes: não junta
  };

  const aliases = new Map<string, string>();
  for (const a of ads) {
    if (!a.offerKey.startsWith("a:")) continue;
    const name = normalizeName(a.advertiser);
    const target = dominant(byPage.get(a.pageUrl ?? "")) ?? dominant(byName.get(name)) ?? hints.get(name) ?? null;
    if (target && target !== a.offerKey) {
      aliases.set(a.offerKey, target);
      a.offerKey = target;
    }
  }
  return [...aliases].map(([alias, target]) => ({ alias, target }));
}

const mostCommon = <T,>(xs: T[]): T | null => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

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
    const starts = list.map((a) => a.startDate).filter((d): d is string => !!d).sort();
    const domain = list.find((a) => a.domain && offerKey.startsWith("d:"))?.domain ?? null;
    const byCopies = [...list].sort((x, y) => y.copies - x.copies);
    const top = byCopies[0];
    // link real (com caminho) vale mais que a página inicial deduzida do domínio
    const landing =
      byCopies.find((a) => a.landingUrl && new URL(a.landingUrl).pathname.length > 1)?.landingUrl ??
      byCopies.find((a) => a.landingUrl)?.landingUrl ?? null;
    const pageUrl = list.find((a) => a.advertiser === advertisers[0] && a.pageUrl)?.pageUrl ?? byCopies.find((a) => a.pageUrl)?.pageUrl ?? null;
    const thumb = byCopies.find((a) => a.thumbUrl)?.thumbUrl ?? null;
    const destType = (mostCommon(list.map((a) => a.destType).filter(Boolean)) ?? null) as DestType | null;

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
      sampleText: Array.from(top.body).slice(0, 300).join(""),
      landingUrl: landing,
      pageUrl,
      thumbUrl: thumb,
      destType,
    });
  }
  return snaps.sort((a, b) => b.copies + 2 * b.cards - (a.copies + 2 * a.cards));
}

/** Sinal mínimo de escala (mesma regra do painel). */
export const hasSignal = (s: Pick<OfferSnapshot, "copies" | "pages">) => s.copies >= 3 || s.pages >= 2;
