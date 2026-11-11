import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCountry, mergeAds, resolveOfferKeys, type AdWithMeta } from "./aggregate.js";
import { BUCKET, toThumb } from "./creatives.js";
import * as db from "./db.js";
import { hostOf } from "./parse/links.js";
import { hasSecondLevelSuffix } from "./parse/meta.js";
import { jitter } from "./sources/browser.js";
import { GoogleTransparencySource } from "./sources/googleBrowser.js";
import { MetaBrowserSource } from "./sources/metaBrowser.js";
import { esc, panelUrl, sendTelegram } from "./telegram.js";
import type { KeywordResult, MetaAd } from "./types.js";

/**
 * Pesquisar: busca sob demanda pedida pelo painel. A pessoa digita uma palavra, um site ou um nicho
 * e o robô procura anúncios ATIVOS na Biblioteca da Meta (para site, também conta os anúncios no Google;
 * para nicho, busca cada palavra do nicho e junta tudo).
 * Os resultados ficam em `search_ads`, separados do ranking (não mexem no score nem nos alertas).
 */

export interface SearchRequest {
  id: number;
  term: string;
  kind: "palavra" | "site" | "nicho";
  match: "exata" | "qualquer";
  country: string;
  requested_at: string;
  terms?: string[] | null; // só nicho: palavras que o painel gerou para o nicho
}

/** Resultado de cada palavra do nicho. */
export interface TermStat {
  term: string;
  total: string | null; // o que a Meta mostra ("~6.900 resultados")
  ads: number;          // anúncios lidos
  error?: string;
}

export interface SearchOutcome {
  ads: (AdWithMeta & { siteMatch: boolean | null })[];
  total: string | null;
  google: number | null;
  message: string;
  termStats?: TermStat[];
}

/** Limpa a lista de palavras do nicho: minúsculas, sem repetidas, sem vazias, até `max` (sem lista, usa o nome do nicho). */
export function nicheTerms(terms: (string | null | undefined)[] | null | undefined, fallback: string, max = num("NICHE_MAX_TERMS", 10)): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const list = (terms ?? []).filter((t) => String(t ?? "").trim());
  for (const raw of list.length ? list : [fallback]) {
    const t = String(raw ?? "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const num = (name: string, def: number) => Number(process.env[name] || def);

/** "https://www.Loja.com.br/produto?x=1" -> "loja.com.br"; frase com espaço -> null */
export function siteOf(term: string): string | null {
  const t = term.trim().toLowerCase();
  if (!t || /\s/.test(t)) return null;
  const host = t.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return /[a-z]{2,}$/.test(host) ? host : null; // termina em letras (".com", ".br"), não é número/versão
}

/** "pilates.laystrancoso.com" -> "laystrancoso.com"; "loja.com.br" fica igual */
export function rootOf(site: string): string {
  const parts = site.split(".");
  return parts.slice(-(hasSecondLevelSuffix(site) ? 3 : 2)).join(".");
}

/** Nome da marca no domínio ("laystrancoso.com" -> "laystrancoso"), usado quando o domínio não acha nada. */
export function brandOf(site: string): string | null {
  const b = rootOf(site).split(".")[0];
  return b.length >= 4 ? b : null;
}

/** O anúncio leva para o site pesquisado (ou para um subdomínio dele)? */
export function matchesSite(ad: Pick<MetaAd, "domain" | "landingUrl">, site: string): boolean {
  const root = rootOf(site);
  const hosts = [ad.domain, hostOf(ad.landingUrl ?? null)]
    .filter((h): h is string => !!h)
    .map((h) => h.toLowerCase().replace(/^www\./, ""));
  return hosts.some((h) => h === site || h.endsWith("." + site) || h === root || h.endsWith("." + root));
}

/** Junta os resultados, agrupa por oferta (mesma regra da coleta) e marca quem leva ao site. */
export function buildOutcome(
  results: KeywordResult[],
  country: string,
  site: string | null,
  hints: Map<string, string> = new Map(),
): SearchOutcome["ads"] {
  // a pesquisa é explícita: não aplica a lista de ignorados (quem busca "shopee.com.br" quer ver a Shopee)
  const ads = mergeAds(results, new Set());
  resolveOfferKeys(ads, hints);
  applyCountry(country, ads, [], []);
  const out = ads.map((a) => ({ ...a, siteMatch: site ? matchesSite(a, site) : null }));
  // busca por site: quem leva ao site vem primeiro (a ordem da Meta é mantida dentro de cada grupo)
  if (site) out.sort((a, b) => Number(b.siteMatch) - Number(a.siteMatch));
  return out;
}

/**
 * Nicho: busca cada palavra (frase exata) e junta tudo. Uma palavra que falha não derruba as outras;
 * se as duas primeiras falharem (ex.: a Meta pediu login), desiste logo.
 */
async function executeNiche(
  req: Pick<SearchRequest, "term" | "country" | "terms">,
  hints: Map<string, string>,
  onProgress?: (msg: string) => Promise<void>,
): Promise<SearchOutcome> {
  const country = req.country.toUpperCase();
  const terms = nicheTerms(req.terms, req.term);
  const source = new MetaBrowserSource({ scrolls: num("NICHE_SCROLLS", 10), maxCards: num("NICHE_MAX_CARDS", 80), country });
  const results: KeywordResult[] = [];
  const stats: TermStat[] = [];
  try {
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      await onProgress?.(`palavra ${i + 1} de ${terms.length}: "${term}"`).catch(() => {});
      try {
        const r = await source.searchKeyword(term, { match: "exact" });
        results.push(r);
        stats.push({ term, total: r.totalResults, ads: r.ads.length });
      } catch (e) {
        const msg = (e as Error).message.split("\n")[0].slice(0, 200);
        console.warn(`[nicho] "${term}":`, msg);
        stats.push({ term, total: null, ads: 0, error: msg });
        if (i === 1 && stats.every((s) => s.error)) throw new Error(`As primeiras palavras falharam: ${msg}`);
      }
      if (i < terms.length - 1) await jitter(2000, 4000);
    }
  } finally {
    await source.close();
  }
  if (!results.length) throw new Error(`Nenhuma palavra do nicho deu certo: ${stats[0]?.error ?? "sem resposta"}`);
  const failed = stats.filter((s) => s.error).length;
  const empty = stats.filter((s) => !s.error && s.ads === 0).map((s) => `"${s.term}"`);
  const message = [
    failed ? `${failed} de ${terms.length} palavras falharam.` : "",
    empty.length ? `Sem anúncios ativos: ${empty.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  return { ads: buildOutcome(results, country, null, hints), total: null, google: null, message, termStats: stats };
}

/** Faz a busca (sem banco): Meta e, para site, a contagem do Google; nicho busca várias palavras. */
export async function executeSearch(
  req: Pick<SearchRequest, "term" | "kind" | "match" | "country" | "terms">,
  hints: Map<string, string> = new Map(),
  onProgress?: (msg: string) => Promise<void>,
): Promise<SearchOutcome> {
  if (req.kind === "nicho") return executeNiche(req, hints, onProgress);
  const country = req.country.toUpperCase();
  const site = req.kind === "site" ? siteOf(req.term) ?? req.term : null;
  const source = new MetaBrowserSource({ scrolls: num("SEARCH_SCROLLS", 15), maxCards: num("SEARCH_MAX_CARDS", 120), country });
  const results: KeywordResult[] = [];
  let total: string | null = null;
  let message = "";
  try {
    if (site) {
      const r = await source.searchKeyword(site, { match: "exact" });
      results.push(r);
      total = r.totalResults;
      const brand = brandOf(site);
      // nenhum anúncio levando ao site: tenta pelo nome da marca e fica só com quem leva ao site
      if (!r.ads.some((a) => matchesSite(a, site)) && brand) {
        await jitter(2000, 4000);
        const r2 = await source.searchKeyword(brand, { match: "any" });
        const hits = r2.ads.filter((a) => matchesSite(a, site));
        results.push({ ...r2, ads: hits });
        if (hits.length) message = `O endereço "${site}" não aparece no texto dos anúncios; achei pelo nome "${brand}".`;
      }
    } else {
      const r = await source.searchKeyword(req.term, { match: req.match === "qualquer" ? "any" : "exact" });
      results.push(r);
      total = r.totalResults;
    }
  } finally {
    await source.close();
  }

  let google: number | null = null;
  if (site) {
    const g = new GoogleTransparencySource();
    try {
      google = await g.countAdsForDomain(rootOf(site), country);
    } catch (e) {
      console.warn("[pesquisa] google:", (e as Error).message);
    } finally {
      await g.close();
    }
  }
  return { ads: buildOutcome(results, country, site, hints), total, google, message };
}

/* ---------------- Banco ---------------- */

const STUCK_MIN = 25;
const STUCK_NICHE_MIN = 60; // nicho busca até 10 palavras: demora mais

/** Pesquisa que ficou "rodando" (robô caiu no meio) vira erro, para dar para pedir de novo. */
async function failStuck(client: SupabaseClient) {
  const before = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const fail = { status: "erro", message: "O robô parou no meio da pesquisa. Clique em pesquisar de novo.", finished_at: new Date().toISOString() };
  await client.from("searches").update(fail).eq("status", "rodando").neq("kind", "nicho").lt("started_at", before(STUCK_MIN));
  await client.from("searches").update(fail).eq("status", "rodando").eq("kind", "nicho").lt("started_at", before(STUCK_NICHE_MIN));
}

/** Pega a próxima pesquisa pendente (a mais antiga) e marca como "rodando". */
async function claimNext(client: SupabaseClient): Promise<SearchRequest | null> {
  for (let tries = 0; tries < 5; tries++) {
    const { data, error } = await client.from("searches").select("id").eq("status", "pendente").order("requested_at").limit(1);
    if (error) throw new Error(`searches: ${error.message}`);
    const id = (data?.[0] as { id: number } | undefined)?.id;
    if (!id) return null;
    // só pega se ainda estiver pendente (outra execução pode ter pego no meio tempo)
    const upd = await client
      .from("searches")
      .update({ status: "rodando", started_at: new Date().toISOString(), message: null })
      .eq("id", id)
      .eq("status", "pendente")
      .select("*"); // "*" funciona antes e depois da migração 008 (coluna terms)
    if (upd.error) throw new Error(`searches: ${upd.error.message}`);
    if (upd.data?.length) return upd.data[0] as SearchRequest;
  }
  return null;
}

/** Guarda as miniaturas (o link do Facebook expira): reaproveita as que a coleta já guardou. */
async function storeThumbs(client: SupabaseClient, searchId: number, ads: SearchOutcome["ads"], limit: number) {
  const todo = ads.filter((a) => a.thumbUrl).slice(0, limit);
  if (!todo.length) return 0;
  const { data: known } = await client.from("ads").select("library_id, thumb_path").in("library_id", todo.map((a) => a.libraryId)).not("thumb_path", "is", null);
  const reuse = new Map(((known ?? []) as { library_id: string; thumb_path: string }[]).map((k) => [k.library_id, k.thumb_path]));
  let saved = 0;
  const one = async (a: SearchOutcome["ads"][number]) => {
    let path = reuse.get(a.libraryId) ?? null;
    if (!path) {
      try {
        const res = await fetch(a.thumbUrl!, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return;
        const webp = await toThumb(Buffer.from(await res.arrayBuffer()));
        const p = `busca/${searchId}/${a.libraryId}.webp`;
        const up = await client.storage.from(BUCKET).upload(p, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
        if (up.error) return;
        path = p;
      } catch {
        return; // imagem indisponível: o painel usa o link do Facebook enquanto ele valer
      }
    }
    await client.from("search_ads").update({ thumb_path: path }).eq("search_id", searchId).eq("library_id", a.libraryId);
    saved++;
  };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));
  return saved;
}

async function saveOutcome(client: SupabaseClient, req: SearchRequest, out: SearchOutcome) {
  await client.from("search_ads").delete().eq("search_id", req.id); // pesquisa refeita
  const rows = out.ads.map((a, i) => ({
    search_id: req.id,
    library_id: a.libraryId,
    position: i,
    offer_key: a.offerKey,
    advertiser: a.advertiser.slice(0, 300),
    domain: a.domain,
    body: a.body ? a.body.slice(0, 5000) : null,
    start_date: a.startDate,
    copies: a.copies,
    cta: a.cta ?? null,
    dest_type: a.destType ?? null,
    page_url: a.pageUrl ?? null,
    landing_url: a.landingUrl ?? null,
    thumb_url: a.thumbUrl ?? null,
    media_type: a.mediaType ?? null,
    site_match: a.siteMatch,
    ...(req.kind === "nicho" ? { terms: a.keywords } : {}),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const res = await client.from("search_ads").insert(db.wellFormed(rows.slice(i, i + 200)));
    if (res.error) throw new Error(`search_ads: ${res.error.message}`);
  }
  const thumbs = await storeThumbs(client, req.id, out.ads, num("SEARCH_THUMBS", 60));
  const offers = new Set(out.ads.map((a) => a.offerKey)).size;
  const fin = await client
    .from("searches")
    .update({
      status: "pronta",
      ads_found: out.ads.length,
      offers_found: offers,
      total_results: out.total,
      google_ads: out.google,
      ...(out.termStats ? { term_stats: out.termStats, terms: out.termStats.map((t) => t.term) } : {}),
      message: out.message || null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  if (fin.error) throw new Error(`searches: ${fin.error.message}`);
  return { offers, thumbs };
}

/** Apaga pesquisas antigas (e as miniaturas delas) para caber no plano grátis. */
async function pruneOld(client: SupabaseClient) {
  const days = num("SEARCH_KEEP_DAYS", 30);
  const limit = new Date(Date.now() - days * 864e5).toISOString();
  const { data } = await client.from("searches").select("id").lt("requested_at", limit).limit(50);
  const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
  if (!ids.length) return 0;
  const { data: paths } = await client.from("search_ads").select("thumb_path").in("search_id", ids).like("thumb_path", "busca/%");
  const files = ((paths ?? []) as { thumb_path: string }[]).map((p) => p.thumb_path);
  for (let i = 0; i < files.length; i += 100) await client.storage.from(BUCKET).remove(files.slice(i, i + 100));
  await client.from("searches").delete().in("id", ids);
  return ids.length;
}

/**
 * Roda todas as pesquisas pendentes, uma por vez (inclusive as que chegarem durante a execução).
 * Usado pelo workflow "Pesquisar agora" e, como reserva, no começo de cada coleta.
 */
export async function processPendingSearches(client: SupabaseClient, max = num("SEARCH_MAX_PER_RUN", 15)) {
  await failStuck(client);
  const notes: string[] = [];
  let done = 0;
  let failed = 0;
  for (let i = 0; i < max; i++) {
    const req = await claimNext(client);
    if (!req) break;
    const t0 = Date.now();
    try {
      const hints = await db.loadAliasHints(client, req.country.toUpperCase()).catch(() => new Map<string, string>());
      const progress = async (msg: string) => {
        await client.from("searches").update({ message: msg }).eq("id", req.id);
      };
      const out = await executeSearch(req, hints, progress);
      const r = await saveOutcome(client, req, out);
      done++;
      const label = req.kind === "nicho" ? `nicho "${req.term}" (${out.termStats?.length ?? 0} palavras)` : `"${req.term}"`;
      const line = `${label} (${req.country}): ${out.ads.length} anúncios ativos, ${r.offers} anunciantes${out.google !== null ? `, Google ${out.google}` : ""}, ${Math.round((Date.now() - t0) / 1000)}s`;
      console.log(`[pesquisa] ${line}`);
      notes.push(line);
      // quem pediu provavelmente saiu da página (esperou mais de 3 min): avisa no Telegram
      if (Date.now() - Date.parse(req.requested_at) > 3 * 60_000) {
        const page = req.kind === "nicho" ? "nicho" : "pesquisar";
        await sendTelegram(
          `🔎 <b>${req.kind === "nicho" ? "Nicho pronto" : "Pesquisa pronta"}:</b> ${esc(req.term)} (${esc(req.country)})\n${out.ads.length} anúncios ativos de ${r.offers} anunciantes` +
            `${out.google !== null ? ` · ${out.google} no Google` : ""}\n<a href="${panelUrl()}/${page}?id=${req.id}">ver resultado</a>`,
        ).catch(() => {});
      }
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      console.warn(`[pesquisa] falhou "${req.term}":`, msg);
      notes.push(`"${req.term}": falhou (${msg.split("\n")[0].slice(0, 160)})`);
      await client
        .from("searches")
        .update({ status: "erro", message: msg.slice(0, 1000), finished_at: new Date().toISOString() })
        .eq("id", req.id);
    }
    await jitter(2000, 4000);
  }
  const pruned = await pruneOld(client).catch(() => 0);
  if (done || failed) await db.logRun(client, "pesquisa", failed === 0, done, notes.join("\n"));
  return { done, failed, pruned, notes };
}
