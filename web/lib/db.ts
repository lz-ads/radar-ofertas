import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoClient } from "./demo";

export function db(): SupabaseClient {
  if (process.env.RADAR_DEMO === "1") return demoClient as unknown as SupabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis da Vercel.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface OfferRow {
  offer_key: string;
  advertiser: string;
  advertisers: string[];
  domain: string | null;
  last_day: string;
  cards: number;
  copies: number;
  pages: number;
  oldest_start: string | null;
  keywords: string[];
  sample_text: string | null;
  cards_7d: number | null;
  copies_7d: number | null;
  copies_growth: number;
  google_ads: number | null;
  first_seen: string;
  score: number;
  landing_url: string | null;
  page_url: string | null;
  thumb_url: string | null;
  dest_type: DestType | null;
  thumb_path: string | null;
  // raio-X da página de vendas
  platform: string | null;
  checkout: string | null;
  price_min: number | string | null;
  price_max: number | string | null;
  installments: string | null;
  cod: boolean | null;
  has_vsl: boolean | null;
  pixels: string[] | null;
  // IA
  niche: string | null;
  kind: string | null;
  audience: string | null;
  promise: string | null;
  mechanism: string | null;
  offer: string | null;
  risk: string | null;
  risk_reason: string | null;
  // funil
  status: Status | null;
  note: string | null;
  discarded: boolean;
}

export type DestType = "site" | "whatsapp" | "instagram" | "formulario" | "mensagem" | "app" | "ligacao";
export const DEST_LABEL: Record<DestType, string> = {
  site: "site", whatsapp: "whatsapp", instagram: "instagram", formulario: "formulário", mensagem: "mensagem", app: "app", ligacao: "ligação",
};

export const STATUSES = ["favorita", "analisando", "modelando", "testando", "descartada"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  favorita: "★ favorita", analisando: "analisando", modelando: "modelando", testando: "testando", descartada: "descartada",
};

export const KIND_LABEL: Record<string, string> = {
  "produto fisico": "produto físico", infoproduto: "infoproduto", nutra: "nutra", servico: "serviço", app: "app", outro: "outro",
};

/** Endereço público da imagem guardada no Storage, ou o link original do Facebook. */
export function creativeSrc(path: string | null | undefined, fallback: string | null | undefined): string | null {
  if (path && process.env.SUPABASE_URL) return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/criativos/${path}`;
  return fallback ?? null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
/** "R$ 97" ou "R$ 97 – 297" */
export function priceRange(min: number | string | null, max: number | string | null): string | null {
  if (min === null || min === undefined) return null;
  const a = Number(min), b = Number(max ?? min);
  const f = (n: number) => brl.format(n).replace(",00", "");
  return a === b ? f(a) : `${f(a)} – ${f(b).replace("R$", "").trim()}`;
}

/** "https://www.loja.com.br/products/kit-3?variant=1" -> "loja.com.br/products/kit-3" */
export function shortUrl(url: string, max = 38): string {
  try {
    const u = new URL(url);
    const s = u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname.replace(/\/$/, ""));
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return url.slice(0, max);
  }
}

export const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export const libraryLink = (q: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&search_type=keyword_unordered&q=${encodeURIComponent(q)}`;
