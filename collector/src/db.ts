import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OfferInput } from "./ai.js";
import type { AdWithMeta, OfferAlias } from "./aggregate.js";
import { isVisitable, type LandingInfo } from "./landing.js";
import { normalizeName } from "./parse/meta.js";
import type { OfferSnapshot, RaCompany } from "./types.js";

/** Mesma regra de "sinal de escala" do painel. */
export const SIGNAL = "copies.gte.3,pages.gte.2,google_ads.gte.10,copies_growth.gt.0";

export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  assertServiceKey(key);
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: safeFetch } });
}

/** Troca metades soltas de emoji (texto cortado no meio) por "\uFFFD"; o Postgres recusa esse JSON. */
export function wellFormed<T>(v: T): T {
  if (typeof v === "string") return v.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD") as T;
  if (Array.isArray(v)) return v.map(wellFormed) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wellFormed(x)])) as T;
  return v;
}

const safeFetch: typeof fetch = (input, init) => {
  if (typeof init?.body === "string" && /\\u[dD][89a-fA-F]/.test(init.body)) {
    try {
      init = { ...init, body: JSON.stringify(wellFormed(JSON.parse(init.body))) };
    } catch {
      /* corpo não é JSON: segue como está */
    }
  }
  return fetch(input, init);
};

/** Garante que a chave é a secreta (service role); a pública não consegue gravar com o RLS ligado. */
export function assertServiceKey(key: string) {
  const msg =
    "SUPABASE_SERVICE_ROLE_KEY está com a chave PÚBLICA do Supabase. Use a chave secreta (começa com sb_secret_ ou é a 'service_role' legada).";
  if (key.startsWith("sb_publishable_")) throw new Error(msg);
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
      if (payload.role && payload.role !== "service_role") throw new Error(msg);
    } catch (e) {
      if ((e as Error).message === msg) throw e;
    }
  }
}

/** Data de hoje no fuso de São Paulo (yyyy-mm-dd). */
export function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export interface SearchTerm {
  term: string;
  country: string;
}

export async function loadKeywords(db: SupabaseClient): Promise<SearchTerm[]> {
  const data = check(await db.from("keywords").select("term, country").eq("active", true).order("id"), "keywords");
  return (data ?? []).map((r: { term: string; country: string | null }) => ({ term: r.term, country: (r.country || "BR").toUpperCase() }));
}

/** Lista de espionagem: termos buscados a cada coleta, além das palavras-chave. */
export async function loadWatch(db: SupabaseClient): Promise<(SearchTerm & { offerKey: string | null; label: string })[]> {
  const res = await db.from("watchlist").select("term, country, offer_key, label").order("id");
  if (res.error) return []; // tabela ainda não criada: segue sem espionagem
  return (res.data ?? []).map((r: { term: string; country: string | null; offer_key: string | null; label: string }) => ({
    term: r.term, country: (r.country || "BR").toUpperCase(), offerKey: r.offer_key, label: r.label,
  }));
}

export async function loadIgnored(db: SupabaseClient): Promise<Set<string>> {
  const data = check(await db.from("ignored_advertisers").select("name"), "ignored_advertisers");
  return new Set((data ?? []).map((r: { name: string }) => r.name.toLowerCase()));
}

export async function saveAds(db: SupabaseClient, ads: (AdWithMeta & { country?: string })[]) {
  const now = new Date().toISOString();
  await inChunks(ads, 500, async (chunk) => {
    check(
      await db.from("ads").upsert(
        chunk.map((a) => ({
          library_id: a.libraryId,
          offer_key: a.offerKey,
          advertiser: a.advertiser,
          domain: a.domain,
          body: a.body,
          start_date: a.startDate,
          copies: a.copies,
          keywords: a.keywords,
          page_url: a.pageUrl ?? null,
          landing_url: a.landingUrl ?? null,
          thumb_url: a.thumbUrl ?? null,
          media_type: a.mediaType ?? null,
          cta: a.cta ?? null,
          dest_type: a.destType ?? null,
          video_url: a.videoUrl ?? null,
          country: a.country ?? "BR",
          last_seen: now,
        })),
        { onConflict: "library_id" },
      ),
      "ads",
    );
  });
}

export async function saveSnapshots(db: SupabaseClient, day: string, snaps: (OfferSnapshot & { country?: string })[]) {
  await inChunks(snaps, 500, async (chunk) => {
    check(
      await db.from("offer_snapshots").upsert(
        chunk.map((s) => ({
          day,
          offer_key: s.offerKey,
          advertiser: s.advertiser,
          advertisers: s.advertisers,
          domain: s.domain,
          cards: s.cards,
          copies: s.copies,
          pages: s.pages,
          oldest_start: s.oldestStart,
          keywords: s.keywords,
          sample_text: s.sampleText,
          landing_url: s.landingUrl,
          page_url: s.pageUrl,
          thumb_url: s.thumbUrl,
          dest_type: s.destType,
          country: s.country ?? "BR",
        })),
        { onConflict: "day,offer_key" },
      ),
      "offer_snapshots",
    );
  });
}

/** Domínios do dia que ainda não têm contagem do Google nos últimos 7 dias. */
export async function domainsNeedingGoogle(db: SupabaseClient, day: string, limit: number): Promise<string[]> {
  const snaps = check(
    await db.from("offer_snapshots").select("domain, copies, cards").eq("day", day).not("domain", "is", null)
      .order("copies", { ascending: false }).limit(limit * 3),
    "snapshots",
  ) as { domain: string }[];
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const recent = check(await db.from("google_counts").select("domain").gte("day", since), "google_counts") as { domain: string }[];
  const done = new Set(recent.map((r) => r.domain));
  return [...new Set(snaps.map((s) => s.domain))].filter((d) => !done.has(d)).slice(0, limit);
}

export async function saveGoogleCount(db: SupabaseClient, day: string, domain: string, ads: number) {
  check(await db.from("google_counts").upsert({ domain, day, ads }, { onConflict: "domain,day" }), "google_counts");
}

export async function raAlreadyToday(db: SupabaseClient, day: string): Promise<boolean> {
  const res = await db.from("ra_new_companies").select("name", { count: "exact", head: true }).eq("day", day);
  return (res.count ?? 0) > 0;
}

export async function saveRa(db: SupabaseClient, day: string, rows: RaCompany[]) {
  if (!rows.length) return;
  // o ranking pode repetir o mesmo nome em posições diferentes: fica a melhor posição
  const unique = [...new Map([...rows].reverse().map((r) => [r.name, r] as const)).values()].sort((a, b) => a.position - b.position);
  check(
    await db.from("ra_new_companies").upsert(
      unique.map((r) => ({ day, position: r.position, name: r.name, slug: r.slug, reputation: r.reputation, complaints: r.complaints })),
      { onConflict: "day,name" },
    ),
    "ra_new_companies",
  );
}

export async function logRun(db: SupabaseClient | null, source: string, ok: boolean, items: number, message = "") {
  if (!db) return;
  await db.from("runs").insert({ source, ok, items, message: message.slice(0, 2000), finished_at: new Date().toISOString() });
}

/** Anunciante -> oferta com site, de coletas dos últimos 30 dias (para juntar duplicadas). */
export async function loadAliasHints(db: SupabaseClient, country = "BR"): Promise<Map<string, string>> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const prefix = country === "BR" ? "d:%" : `${country.toLowerCase()}:d:%`;
  const raw = check(
    await db.from("ads").select("advertiser, offer_key, copies").like("offer_key", prefix).gte("last_seen", since).limit(10000),
    "ads (apelidos)",
  ) as { advertiser: string; offer_key: string; copies: number }[];
  // as dicas usam a chave sem o país (o país é aplicado depois de agrupar)
  const rows = raw.map((r) => ({ ...r, offer_key: r.offer_key.replace(/^[a-z]{2}:(?=d:)/, "") }));
  const byName = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const n = normalizeName(r.advertiser);
    const m = byName.get(n) ?? new Map<string, number>();
    m.set(r.offer_key, (m.get(r.offer_key) ?? 0) + (r.copies || 1));
    byName.set(n, m);
  }
  const out = new Map<string, string>();
  for (const [n, m] of byName) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [key, c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (c / total >= 0.7) out.set(n, key);
  }
  return out;
}

export async function saveAliases(db: SupabaseClient, aliases: OfferAlias[]) {
  if (!aliases.length) return;
  check(await db.from("offer_aliases").upsert(aliases, { onConflict: "alias" }), "offer_aliases");
}

/** Páginas de vendas das ofertas com sinal que ainda não foram analisadas (ou têm mais de 7 dias). */
export async function landingsToCheck(db: SupabaseClient, limit: number): Promise<string[]> {
  const offers = check(
    await db.from("offer_ranking").select("landing_url").not("landing_url", "is", null).or(SIGNAL).order("score", { ascending: false }).limit(400),
    "offer_ranking (páginas)",
  ) as { landing_url: string }[];
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const done = check(await db.from("landing_pages").select("url").gte("checked_at", since).limit(5000), "landing_pages") as { url: string }[];
  const seen = new Set(done.map((d) => d.url));
  return [...new Set(offers.map((o) => o.landing_url))].filter((u) => isVisitable(u) && !seen.has(u)).slice(0, limit);
}

/** Páginas das ofertas prioritárias que ainda não têm print ou texto completo (kit de modelagem). */
export async function landingsNeedingShot(db: SupabaseClient, keys: string[], limit: number): Promise<string[]> {
  if (!keys.length) return [];
  const offers = check(
    await db.from("offer_ranking").select("offer_key, landing_url").in("offer_key", keys.slice(0, 300)).not("landing_url", "is", null),
    "offer_ranking (prints)",
  ) as { offer_key: string; landing_url: string }[];
  const order = new Map(keys.map((k, i) => [k, i]));
  const urls = [...new Set(offers.sort((a, b) => (order.get(a.offer_key) ?? 0) - (order.get(b.offer_key) ?? 0)).map((o) => o.landing_url))].filter(isVisitable);
  if (!urls.length) return [];
  const done = check(
    await db.from("landing_pages").select("url, shot_path, full_text").in("url", urls).not("shot_path", "is", null).not("full_text", "is", null),
    "landing_pages (prints)",
  ) as { url: string }[];
  const have = new Set(done.map((d) => d.url));
  return urls.filter((u) => !have.has(u)).slice(0, limit);
}

export const SHOTS_BUCKET = "paginas";

export async function saveLandings(db: SupabaseClient, rows: LandingInfo[]) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const shotPath = new Map<string, string>();
  for (const r of rows) {
    if (!r.shot) continue;
    const path = `p/${createHash("sha1").update(r.url).digest("hex").slice(0, 24)}.webp`;
    const up = await db.storage.from(SHOTS_BUCKET).upload(path, r.shot, { contentType: "image/webp", upsert: true, cacheControl: "86400" });
    if (up.error) console.warn(`[paginas] print não salvo ${r.url}:`, up.error.message);
    else shotPath.set(r.url, path);
  }
  check(
    await db.from("landing_pages").upsert(
      rows.map((r) => ({
        url: r.url, final_url: r.finalUrl, status: r.status, title: r.title, description: r.description,
        platform: r.platform, checkout: r.checkout, prices: r.prices, price_min: r.priceMin, price_max: r.priceMax,
        installments: r.installments, cod: r.cod, has_vsl: r.hasVsl, has_countdown: r.hasCountdown,
        has_whatsapp: r.hasWhatsapp, pixels: r.pixels, excerpt: r.excerpt, error: r.error, checked_at: now,
        currency: r.currency ?? null,
        // print e texto completo só quando foram feitos agora (não apaga os anteriores)
        ...(r.fullText ? { full_text: r.fullText } : {}),
        ...(shotPath.has(r.url) ? { shot_path: shotPath.get(r.url) } : {}),
      })),
      { onConflict: "url" },
    ),
    "landing_pages",
  );
}

/** Ofertas com sinal cujo conteúdo mudou desde a última análise da IA. */
export async function offersForAi(db: SupabaseClient, limit: number, hash: (o: OfferInput) => string): Promise<(OfferInput & { hash: string })[]> {
  const offers = check(
    await db.from("offer_ranking").select("offer_key, advertiser, domain, landing_url").or(SIGNAL).order("score", { ascending: false }).limit(250),
    "offer_ranking (ia)",
  ) as { offer_key: string; advertiser: string; domain: string | null; landing_url: string | null }[];
  if (!offers.length) return [];
  const keys = offers.map((o) => o.offer_key);
  const [ins, ads, pages] = await Promise.all([
    db.from("offer_insights").select("offer_key, input_hash").in("offer_key", keys),
    db.from("ads").select("offer_key, body, copies").in("offer_key", keys).order("copies", { ascending: false }).limit(3000),
    db.from("landing_pages").select("url, title, excerpt, prices").in("url", offers.map((o) => o.landing_url).filter((u): u is string => !!u)),
  ]);
  const stored = new Map((ins.data ?? []).map((r: { offer_key: string; input_hash: string }) => [r.offer_key, r.input_hash]));
  const texts = new Map<string, string[]>();
  for (const a of (ads.data ?? []) as { offer_key: string; body: string | null }[]) {
    if (!a.body) continue;
    const list = texts.get(a.offer_key) ?? [];
    if (list.length < 3 && !list.includes(a.body)) list.push(a.body);
    texts.set(a.offer_key, list);
  }
  const page = new Map(((pages.data ?? []) as { url: string; title: string | null; excerpt: string | null; prices: number[] | null }[]).map((p) => [p.url, p]));
  const out: (OfferInput & { hash: string })[] = [];
  for (const o of offers) {
    const p = o.landing_url ? page.get(o.landing_url) : undefined;
    const input: OfferInput = {
      key: o.offer_key, advertiser: o.advertiser, domain: o.domain, texts: texts.get(o.offer_key) ?? [],
      landingTitle: p?.title ?? null, landingExcerpt: p?.excerpt ?? null, prices: p?.prices ?? [],
    };
    if (!input.texts.length && !input.landingExcerpt) continue;
    const h = hash(input);
    if (stored.get(o.offer_key) === h) continue;
    out.push({ ...input, hash: h });
    if (out.length >= limit) break;
  }
  return out;
}

export async function saveInsights(
  db: SupabaseClient,
  rows: { key: string; nicho: string; tipo: string; publico: string; promessa: string; mecanismo: string; oferta: string; risco: string; motivo_risco: string; hash: string; model: string }[],
) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  check(
    await db.from("offer_insights").upsert(
      rows.map((r) => ({
        offer_key: r.key, niche: r.nicho, kind: r.tipo, audience: r.publico, promise: r.promessa, mechanism: r.mecanismo,
        offer: r.oferta, risk: r.risco, risk_reason: r.motivo_risco, model: r.model, input_hash: r.hash, updated_at: now,
      })),
      { onConflict: "offer_key" },
    ),
    "offer_insights",
  );
}

/** Imagens ainda não guardadas dos anúncios das ofertas com sinal. */
export async function creativesToStore(db: SupabaseClient, keys: string[], limit: number) {
  if (!keys.length) return [];
  const rows = check(
    await db.from("ads").select("library_id, thumb_url").in("offer_key", keys.slice(0, 300)).is("thumb_path", null)
      .not("thumb_url", "is", null).order("copies", { ascending: false }).limit(limit),
    "ads (criativos)",
  ) as { library_id: string; thumb_url: string }[];
  return rows.map((r) => ({ libraryId: r.library_id, thumbUrl: r.thumb_url }));
}

export async function signalKeys(db: SupabaseClient): Promise<string[]> {
  const rows = check(
    await db.from("offer_ranking").select("offer_key").or(SIGNAL).order("score", { ascending: false }).limit(300),
    "offer_ranking (sinal)",
  ) as { offer_key: string }[];
  return rows.map((r) => r.offer_key);
}

export async function rankingForAlerts(db: SupabaseClient) {
  return check(
    await db.from("offer_ranking").select("offer_key, advertiser, domain, score, copies, copies_7d, copies_growth, niche")
      .eq("discarded", false).or(SIGNAL).order("score", { ascending: false }).limit(300),
    "offer_ranking (alertas)",
  ) as import("./alerts.js").RankRow[];
}

export async function loadSentAlerts(db: SupabaseClient): Promise<Map<string, number>> {
  const rows = check(await db.from("alerts_sent").select("offer_key, kind, sent_at").limit(10000), "alerts_sent") as { offer_key: string; kind: string; sent_at: string }[];
  return new Map(rows.map((r) => [`${r.offer_key}|${r.kind}`, Date.parse(r.sent_at)]));
}

export async function markAlerts(db: SupabaseClient, items: { key: string; kind: string }[]) {
  if (!items.length) return;
  const now = new Date().toISOString();
  check(await db.from("alerts_sent").upsert(items.map((i) => ({ offer_key: i.key, kind: i.kind, sent_at: now })), { onConflict: "offer_key,kind" }), "alerts_sent");
}

/** Já existe uma coleta da Meta bem-sucedida hoje? (Google e Reclame Aqui rodam 1x por dia) */
export async function ranToday(db: SupabaseClient, source: string, day: string): Promise<boolean> {
  const since = new Date(`${day}T00:00:00-03:00`).toISOString();
  const res = await db.from("runs").select("id", { count: "exact", head: true }).eq("source", source).eq("ok", true).gte("finished_at", since);
  return (res.count ?? 0) > 0;
}

/**
 * Ofertas que merecem guardar mídia, print e kit: as do seu funil e da espionagem primeiro,
 * depois as de maior score com sinal de escala.
 */
export async function priorityKeys(db: SupabaseClient, topN: number): Promise<string[]> {
  const [funnel, watch, top] = await Promise.all([
    db.from("offer_notes").select("offer_key, status").not("status", "is", null).neq("status", "descartada").limit(500),
    db.from("watchlist").select("offer_key").not("offer_key", "is", null).limit(500),
    db.from("offer_ranking").select("offer_key").eq("discarded", false).or(SIGNAL).order("score", { ascending: false }).limit(topN),
  ]);
  const keys = [
    ...((funnel.data ?? []) as { offer_key: string }[]).map((r) => r.offer_key),
    ...((watch.data ?? []) as { offer_key: string }[]).map((r) => r.offer_key),
    ...(check(top, "offer_ranking (prioridade)") ?? []).map((r: { offer_key: string }) => r.offer_key),
  ];
  return [...new Set(keys)];
}

/** Vídeos/imagens originais ainda não guardados: os N anúncios com mais cópias de cada oferta prioritária. */
export async function mediaToStore(db: SupabaseClient, keys: string[], perOffer: number, limit: number) {
  if (!keys.length) return [];
  const since = new Date(Date.now() - 3 * 864e5).toISOString(); // link do Facebook ainda válido
  const rows: { library_id: string; offer_key: string; media_type: string | null; video_url: string | null; thumb_url: string | null; media_path: string | null }[] = [];
  for (let i = 0; i < keys.length; i += 150) {
    const res = await db.from("ads").select("library_id, offer_key, media_type, video_url, thumb_url, media_path")
      .in("offer_key", keys.slice(i, i + 150)).gte("last_seen", since).order("copies", { ascending: false }).limit(3000);
    rows.push(...(check(res, "ads (mídia)") ?? []));
  }
  const rank = new Map(keys.map((k, i) => [k, i]));
  const byOffer = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOffer.get(r.offer_key) ?? [];
    list.push(r);
    byOffer.set(r.offer_key, list);
  }
  const out: import("./media.js").MediaItem[] = [];
  for (const [key, list] of [...byOffer].sort((a, b) => (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))) {
    void key;
    for (const r of list.slice(0, perOffer)) {
      if (r.media_path) continue;
      if (r.video_url) out.push({ libraryId: r.library_id, url: r.video_url, kind: "video" });
      else if (r.thumb_url && r.media_type !== "video") out.push({ libraryId: r.library_id, url: r.thumb_url, kind: "image" });
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Vídeos já guardados (até 18 MB, limite do envio direto ao Gemini) que ainda não foram transcritos. */
export async function videosToTranscribe(db: SupabaseClient, keys: string[], limit: number) {
  if (!keys.length) return [];
  const rows: { library_id: string; offer_key: string; media_path: string; media_bytes: number | null; copies: number }[] = [];
  for (let i = 0; i < keys.length; i += 150) {
    const res = await db.from("ads").select("library_id, offer_key, media_path, media_bytes, copies")
      .in("offer_key", keys.slice(i, i + 150)).like("media_path", "%.mp4").lte("media_bytes", 18 * 1024 * 1024)
      .order("copies", { ascending: false }).limit(1000);
    rows.push(...(check(res, "ads (vídeos)") ?? []));
  }
  if (!rows.length) return [];
  const done = new Set(
    ((check(await db.from("ad_transcripts").select("library_id").in("library_id", rows.map((r) => r.library_id)), "ad_transcripts") ?? []) as { library_id: string }[])
      .map((r) => r.library_id),
  );
  const order = new Map(keys.map((k, i) => [k, i]));
  return rows
    .filter((r) => !done.has(r.library_id))
    .sort((a, b) => (order.get(a.offer_key) ?? 0) - (order.get(b.offer_key) ?? 0) || b.copies - a.copies)
    .slice(0, limit);
}

export async function saveTranscript(
  db: SupabaseClient,
  libraryId: string,
  t: { transcricao: string; gancho: string; estrutura: string; cta: string },
  model: string,
) {
  check(
    await db.from("ad_transcripts").upsert(
      { library_id: libraryId, transcript: t.transcricao, hook: t.gancho, structure: t.estrutura, cta: t.cta, model, created_at: new Date().toISOString() },
      { onConflict: "library_id" },
    ),
    "ad_transcripts",
  );
}

/** Dados para o mapa da página (kit) das ofertas prioritárias com texto completo da página. */
export async function kitsToBuild(db: SupabaseClient, keys: string[], limit: number, hash: (k: import("./ai.js").KitInput) => string) {
  if (!keys.length) return [];
  const offers = (check(
    await db.from("offer_ranking").select("offer_key, advertiser, domain, landing_url, platform, checkout").in("offer_key", keys.slice(0, 300)).not("landing_url", "is", null),
    "offer_ranking (kits)",
  ) ?? []) as { offer_key: string; advertiser: string; domain: string | null; landing_url: string; platform: string | null; checkout: string | null }[];
  if (!offers.length) return [];
  const [pages, kits, ads] = await Promise.all([
    db.from("landing_pages").select("url, full_text, prices, currency").in("url", [...new Set(offers.map((o) => o.landing_url))]).not("full_text", "is", null),
    db.from("offer_kits").select("offer_key, source_hash").in("offer_key", offers.map((o) => o.offer_key)),
    db.from("ads").select("offer_key, body, copies").in("offer_key", offers.map((o) => o.offer_key)).order("copies", { ascending: false }).limit(2000),
  ]);
  const page = new Map(((pages.data ?? []) as { url: string; full_text: string; prices: number[] | null; currency: string | null }[]).map((p) => [p.url, p]));
  const stored = new Map(((kits.data ?? []) as { offer_key: string; source_hash: string | null }[]).map((k) => [k.offer_key, k.source_hash]));
  const texts = new Map<string, string[]>();
  for (const a of (ads.data ?? []) as { offer_key: string; body: string | null }[]) {
    if (!a.body) continue;
    const l = texts.get(a.offer_key) ?? [];
    if (l.length < 3 && !l.includes(a.body)) l.push(a.body);
    texts.set(a.offer_key, l);
  }
  const order = new Map(keys.map((k, i) => [k, i]));
  const out: (import("./ai.js").KitInput & { hash: string })[] = [];
  for (const o of offers.sort((a, b) => (order.get(a.offer_key) ?? 0) - (order.get(b.offer_key) ?? 0))) {
    const p = page.get(o.landing_url);
    if (!p?.full_text || p.full_text.length < 200) continue;
    const input = {
      key: o.offer_key, advertiser: o.advertiser, domain: o.domain, url: o.landing_url, pageText: p.full_text,
      prices: (p.prices ?? []).map(Number), currency: p.currency, checkout: o.checkout, platform: o.platform, adTexts: texts.get(o.offer_key) ?? [],
    };
    const h = hash(input);
    if (stored.get(o.offer_key) === h) continue;
    out.push({ ...input, hash: h });
    if (out.length >= limit) break;
  }
  return out;
}

export async function saveKit(db: SupabaseClient, key: string, structure: unknown, model: string, hash: string) {
  check(
    await db.from("offer_kits").upsert(
      { offer_key: key, structure, model, source_hash: hash, updated_at: new Date().toISOString() },
      { onConflict: "offer_key" },
    ),
    "offer_kits",
  );
}

/** Itens da espionagem adicionados à mão (só o termo): liga à oferta quando ela aparecer no ranking. */
export async function resolveWatch(db: SupabaseClient) {
  const res = await db.from("watchlist").select("id, term, country").is("offer_key", null);
  if (res.error || !res.data?.length) return 0;
  let n = 0;
  for (const w of res.data as { id: number; term: string; country: string }[]) {
    const t = w.term.trim().toLowerCase();
    const q = db.from("offer_ranking").select("offer_key, score").eq("country", w.country).order("score", { ascending: false }).limit(1);
    const found = t.includes(".") && !t.includes(" ")
      ? await q.or(`domain.eq.${t},domain.like.%.${t}`)
      : await q.ilike("advertiser", t.replace(/[%_,()]/g, " "));
    const key = (found.data?.[0] as { offer_key?: string } | undefined)?.offer_key;
    if (key) {
      await db.from("watchlist").update({ offer_key: key }).eq("id", w.id);
      n++;
    }
  }
  return n;
}

/** Quantos anúncios novos cada oferta espionada ganhou desde o último aviso. */
export async function watchNews(db: SupabaseClient, sent: Map<string, number>) {
  const res = await db.from("watchlist").select("offer_key, label").not("offer_key", "is", null);
  if (res.error) return { news: [], toMark: [] as string[] };
  const news: import("./alerts.js").WatchNews[] = [];
  const toMark: string[] = [];
  for (const w of (res.data ?? []) as { offer_key: string; label: string }[]) {
    const since = sent.get(`${w.offer_key}|watch`);
    if (since === undefined) {
      toMark.push(w.offer_key); // primeira vez: só marca o ponto de partida
      continue;
    }
    const c = await db.from("ads").select("library_id", { count: "exact", head: true }).eq("offer_key", w.offer_key).gt("first_seen", new Date(since).toISOString());
    if ((c.count ?? 0) > 0) {
      news.push({ key: w.offer_key, label: w.label, newAds: c.count ?? 0 });
      toMark.push(w.offer_key);
    }
  }
  return { news, toMark };
}

/** Ofertas do seu funil que estão esfriando. */
export async function coolingInFunnel(db: SupabaseClient) {
  const res = await db.from("offer_ranking").select("offer_key, advertiser, copies, copies_7d, status")
    .eq("cooling", true).not("status", "is", null).eq("discarded", false).limit(50);
  return res.error ? [] : ((res.data ?? []) as import("./alerts.js").CoolingRow[]);
}
