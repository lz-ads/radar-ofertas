import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferRow } from "./db";

/** Filtros do ranking, lidos da URL (a URL é a fonte da verdade: dá para salvar e compartilhar). */
export interface Filters {
  q: string;
  kw: string;
  sort: SortKey;
  dir: "asc" | "desc";
  novas: boolean;
  crescendo: boolean;
  google: boolean;
  site: boolean;
  /** inclui ofertas sem sinal de escala (1 anúncio, sem cópias, sem Google, sem crescimento) */
  todas: boolean;
  limit: number;
}

/** Sinal mínimo de escala: algo além de um anúncio solto. */
export const STRONG_SIGNAL = "copies.gte.3,pages.gte.2,google_ads.gte.10,copies_growth.gt.0";

export const SORTS = {
  score: "score",
  crescimento: "copies_growth",
  copias: "copies",
  topo: "cards",
  paginas: "pages",
  google: "google_ads",
  desde: "oldest_start",
  nome: "advertiser",
} as const satisfies Record<string, keyof OfferRow>;
export type SortKey = keyof typeof SORTS;

export const PAGE_SIZE = 100;
const MAX = 1000;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(sp: Raw): Filters {
  const sort = (Object.keys(SORTS).includes(one(sp.ordem)) ? one(sp.ordem) : "score") as SortKey;
  const defaultDir = sort === "nome" || sort === "desde" ? "asc" : "desc";
  const dir = one(sp.dir) === "asc" || one(sp.dir) === "desc" ? (one(sp.dir) as "asc" | "desc") : defaultDir;
  const n = Number(one(sp.n));
  return {
    q: one(sp.q).replace(/[,()%*\\]/g, " ").trim().slice(0, 80),
    kw: one(sp.kw).trim(),
    sort,
    dir,
    novas: one(sp.novas) === "1",
    crescendo: one(sp.crescendo) === "1",
    google: one(sp.google) === "1",
    site: one(sp.site) === "1",
    todas: one(sp.todas) === "1",
    limit: Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), MAX) : PAGE_SIZE,
  };
}

/** Monta a URL do ranking mudando só o que for passado. */
export function hrefWith(f: Filters, patch: Partial<Filters>, path = "/"): string {
  const m = { ...f, ...patch };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.kw) p.set("kw", m.kw);
  if (m.sort !== "score") p.set("ordem", m.sort);
  const defaultDir = m.sort === "nome" || m.sort === "desde" ? "asc" : "desc";
  if (m.dir !== defaultDir) p.set("dir", m.dir);
  if (m.novas) p.set("novas", "1");
  if (m.crescendo) p.set("crescendo", "1");
  if (m.google) p.set("google", "1");
  if (m.site) p.set("site", "1");
  if (m.todas) p.set("todas", "1");
  if (m.limit !== PAGE_SIZE) p.set("n", String(m.limit));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export function isFiltered(f: Filters) {
  return !!(f.q || f.kw || f.novas || f.crescendo || f.google || f.site);
}

/** Consulta do ranking com os filtros aplicados. Devolve também o total (para "mostrar mais"). */
export async function queryOffers(client: SupabaseClient, f: Filters, limit = f.limit) {
  let query = client
    .from("offer_ranking")
    .select("*", { count: "exact" })
    .order(SORTS[f.sort], { ascending: f.dir === "asc", nullsFirst: false })
    .order("score", { ascending: false })
    .limit(limit);
  if (f.kw) query = query.contains("keywords", [f.kw]);
  const search = f.q ? `advertiser.ilike.%${f.q}%,domain.ilike.%${f.q}%,sample_text.ilike.%${f.q}%,landing_url.ilike.%${f.q}%` : null;
  if (f.novas) query = query.gte("first_seen", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  if (f.crescendo) query = query.gt("copies_growth", 0);
  if (f.google) query = query.gt("google_ads", 0);
  if (f.site) query = query.not("landing_url", "is", null);
  // dois "OU" juntos viram um único filtro: (busca) E (sinal de escala)
  if (search && !f.todas) query = query.or(`and(or(${search}),or(${STRONG_SIGNAL}))`);
  else if (search) query = query.or(search);
  else if (!f.todas) query = query.or(STRONG_SIGNAL);
  const { data, error, count } = await query;
  return { offers: (data ?? []) as OfferRow[], error, total: count ?? (data ?? []).length };
}

/** Quantas ofertas os mesmos filtros trariam incluindo as de sinal fraco. */
export async function countAll(client: SupabaseClient, f: Filters) {
  if (f.todas) return null;
  const { total } = await queryOffers(client, { ...f, todas: true }, 1);
  return total;
}
