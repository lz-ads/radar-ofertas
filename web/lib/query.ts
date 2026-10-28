import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUSES, type OfferRow } from "./db";

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
  nicho: string;
  tipo: string;
  destino: string;
  checkout: string;
  preco: number | null;  // preço mínimo da página até X reais
  risco: string;
  cod: boolean;          // pagamento na entrega
  vsl: boolean;
  /** status do funil; "todos" mostra também as descartadas */
  status: string;
  /** país (BR por padrão; "todos" junta todos) */
  pais: string;
  validadas: boolean;  // anúncios rodando há 30+ dias
  esfriando: boolean;  // cópias caindo forte na semana
  espionadas: boolean; // na lista de espionagem
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
  preco: "price_min",
  validadas: "long_runners",
  dias: "days_running",
} as const satisfies Record<string, keyof OfferRow>;
export type SortKey = keyof typeof SORTS;

export const PAGE_SIZE = 100;
const MAX = 1000;
const ASC_DEFAULT: SortKey[] = ["nome", "desde", "preco"];
export const ascDefault = (k: SortKey) => ASC_DEFAULT.includes(k);

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string, n = 60) => v.replace(/[,()%*\\]/g, " ").trim().slice(0, n);

/** "us" -> "US"; "todos" fica "todos"; qualquer outra coisa vira Brasil. */
export function parsePais(v: string): string {
  const up = v.trim().toUpperCase();
  if (up === "TODOS") return "todos";
  return /^[A-Z]{2}$/.test(up) ? up : "BR";
}

export function parseFilters(sp: Raw): Filters {
  const sort = (Object.keys(SORTS).includes(one(sp.ordem)) ? one(sp.ordem) : "score") as SortKey;
  const defaultDir = ASC_DEFAULT.includes(sort) ? "asc" : "desc";
  const dir = one(sp.dir) === "asc" || one(sp.dir) === "desc" ? (one(sp.dir) as "asc" | "desc") : defaultDir;
  const n = Number(one(sp.n));
  const preco = Number(one(sp.preco));
  const status = one(sp.status);
  return {
    q: clean(one(sp.q), 80),
    kw: one(sp.kw).trim(),
    sort,
    dir,
    novas: one(sp.novas) === "1",
    crescendo: one(sp.crescendo) === "1",
    google: one(sp.google) === "1",
    site: one(sp.site) === "1",
    todas: one(sp.todas) === "1",
    nicho: clean(one(sp.nicho)),
    tipo: clean(one(sp.tipo)),
    destino: clean(one(sp.destino)),
    checkout: clean(one(sp.checkout)),
    preco: Number.isFinite(preco) && preco > 0 ? preco : null,
    risco: ["baixo", "medio", "alto"].includes(one(sp.risco)) ? one(sp.risco) : "",
    cod: one(sp.cod) === "1",
    vsl: one(sp.vsl) === "1",
    status: status === "todos" || (STATUSES as readonly string[]).includes(status) || status === "funil" ? status : "",
    pais: parsePais(one(sp.pais)),
    validadas: one(sp.validadas) === "1",
    esfriando: one(sp.esfriando) === "1",
    espionadas: one(sp.espionadas) === "1",
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
  const defaultDir = ASC_DEFAULT.includes(m.sort) ? "asc" : "desc";
  if (m.dir !== defaultDir) p.set("dir", m.dir);
  for (const k of ["novas", "crescendo", "google", "site", "todas", "cod", "vsl", "validadas", "esfriando", "espionadas"] as const) if (m[k]) p.set(k, "1");
  if (m.pais && m.pais !== "BR") p.set("pais", m.pais);
  for (const k of ["nicho", "tipo", "destino", "checkout", "risco", "status"] as const) if (m[k]) p.set(k, m[k]);
  if (m.preco) p.set("preco", String(m.preco));
  if (m.limit !== PAGE_SIZE) p.set("n", String(m.limit));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export function isFiltered(f: Filters) {
  return !!(f.q || f.kw || f.novas || f.crescendo || f.google || f.site || f.nicho || f.tipo || f.destino || f.checkout || f.preco || f.risco || f.cod || f.vsl || f.status || f.validadas || f.esfriando || f.espionadas);
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
  const search = f.q
    ? `advertiser.ilike.%${f.q}%,domain.ilike.%${f.q}%,sample_text.ilike.%${f.q}%,landing_url.ilike.%${f.q}%,promise.ilike.%${f.q}%`
    : null;
  if (f.novas) query = query.gte("first_seen", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  if (f.crescendo) query = query.gt("copies_growth", 0);
  if (f.google) query = query.gt("google_ads", 0);
  if (f.site) query = query.not("landing_url", "is", null);
  if (f.nicho) query = query.eq("niche", f.nicho);
  if (f.tipo) query = query.eq("kind", f.tipo);
  if (f.destino) query = query.eq("dest_type", f.destino);
  if (f.checkout) query = query.or(`checkout.eq.${f.checkout},platform.eq.${f.checkout}`);
  if (f.preco) query = query.lte("price_min", f.preco);
  if (f.risco) query = query.eq("risk", f.risco);
  if (f.cod) query = query.eq("cod", true);
  if (f.vsl) query = query.eq("has_vsl", true);
  if (f.pais !== "todos") query = query.eq("country", f.pais);
  if (f.validadas) query = query.gt("long_runners", 0);
  if (f.esfriando) query = query.eq("cooling", true);
  if (f.espionadas) query = query.eq("watched", true);
  // funil: descartadas ficam fora do ranking, a não ser que peça
  if (f.status === "funil") query = query.not("status", "is", null).eq("discarded", false);
  else if (f.status && f.status !== "todos") query = query.eq("status", f.status);
  else if (f.status !== "todos") query = query.eq("discarded", false);
  // vários "OU" juntos viram um único filtro: (busca) E (sinal de escala)
  const ors = [search, !f.todas && !f.status ? STRONG_SIGNAL : null].filter(Boolean) as string[];
  if (ors.length === 2) query = query.or(`and(or(${ors[0]}),or(${ors[1]}))`);
  else if (ors.length === 1) query = query.or(ors[0]);
  const { data, error, count } = await query;
  return { offers: (data ?? []) as OfferRow[], error, total: count ?? (data ?? []).length };
}

/** Quantas ofertas os mesmos filtros trariam incluindo as de sinal fraco. */
export async function countAll(client: SupabaseClient, f: Filters) {
  if (f.todas || f.status) return null;
  const { total } = await queryOffers(client, { ...f, todas: true }, 1);
  return total;
}
