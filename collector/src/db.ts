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

export async function loadKeywords(db: SupabaseClient): Promise<string[]> {
  const data = check(await db.from("keywords").select("term").eq("active", true).order("id"), "keywords");
  return (data ?? []).map((r: { term: string }) => r.term);
}

export async function loadIgnored(db: SupabaseClient): Promise<Set<string>> {
  const data = check(await db.from("ignored_advertisers").select("name"), "ignored_advertisers");
  return new Set((data ?? []).map((r: { name: string }) => r.name.toLowerCase()));
}

export async function saveAds(db: SupabaseClient, ads: AdWithMeta[]) {
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
          last_seen: now,
        })),
        { onConflict: "library_id" },
      ),
      "ads",
    );
  });
}

export async function saveSnapshots(db: SupabaseClient, day: string, snaps: OfferSnapshot[]) {
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
export async function loadAliasHints(db: SupabaseClient): Promise<Map<string, string>> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = check(
    await db.from("ads").select("advertiser, offer_key, copies").like("offer_key", "d:%").gte("last_seen", since).limit(10000),
    "ads (apelidos)",
  ) as { advertiser: string; offer_key: string; copies: number }[];
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

export async function saveLandings(db: SupabaseClient, rows: LandingInfo[]) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  check(
    await db.from("landing_pages").upsert(
      rows.map((r) => ({
        url: r.url, final_url: r.finalUrl, status: r.status, title: r.title, description: r.description,
        platform: r.platform, checkout: r.checkout, prices: r.prices, price_min: r.priceMin, price_max: r.priceMax,
        installments: r.installments, cod: r.cod, has_vsl: r.hasVsl, has_countdown: r.hasCountdown,
        has_whatsapp: r.hasWhatsapp, pixels: r.pixels, excerpt: r.excerpt, error: r.error, checked_at: now,
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
