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
  // Fase 1
  country: string;
  days_running: number | null;
  ads_active: number;
  long_runners: number;
  new_ads_7d: number;
  media_count: number;
  cooling: boolean;
  watched: boolean;
  has_kit: boolean;
  currency: string | null;
}

/** Países que o robô sabe buscar (dá para adicionar outros nas palavras-chave). */
export const COUNTRIES: Record<string, { flag: string; name: string; locale: string; currency: string }> = {
  BR: { flag: "🇧🇷", name: "Brasil", locale: "pt-BR", currency: "BRL" },
  US: { flag: "🇺🇸", name: "Estados Unidos", locale: "en-US", currency: "USD" },
  GB: { flag: "🇬🇧", name: "Reino Unido", locale: "en-GB", currency: "GBP" },
  PT: { flag: "🇵🇹", name: "Portugal", locale: "pt-PT", currency: "EUR" },
  JP: { flag: "🇯🇵", name: "Japão", locale: "ja-JP", currency: "JPY" },
  ES: { flag: "🇪🇸", name: "Espanha", locale: "es-ES", currency: "EUR" },
  MX: { flag: "🇲🇽", name: "México", locale: "es-MX", currency: "MXN" },
  CA: { flag: "🇨🇦", name: "Canadá", locale: "en-CA", currency: "CAD" },
  AU: { flag: "🇦🇺", name: "Austrália", locale: "en-AU", currency: "AUD" },
};
export const countryName = (c: string | null | undefined) => COUNTRIES[(c || "BR").toUpperCase()]?.name ?? (c || "BR");
export const flag = (c: string | null | undefined) => COUNTRIES[(c || "BR").toUpperCase()]?.flag ?? (c || "").toUpperCase();

/** País de uma chave ("us:d:loja.com" -> "US"). */
export const countryOfKey = (key: string) => key.match(/^([a-z]{2}):[ad]:/)?.[1].toUpperCase() ?? "BR";
/** Nome legível de uma chave ("us:d:loja.com" -> "loja.com"). */
export const keyLabel = (key: string) => key.replace(/^[a-z]{2}:(?=[ad]:)/, "").slice(2);
/** Chave válida de oferta (com ou sem país na frente). */
export const validKey = (k: string) => /^(?:[a-z]{2}:)?[ad]:[^\s]{1,200}$/.test(k);

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

/** Endereço público de um arquivo no Storage do Supabase (com `download`, o navegador baixa em vez de abrir). */
export function storageUrl(bucket: string, path: string, download?: string): string | null {
  if (!process.env.SUPABASE_URL) return null;
  const base = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
  return download ? `${base}?download=${encodeURIComponent(download)}` : base;
}

/** Endereço público da imagem guardada no Storage, ou o link original do Facebook. */
export function creativeSrc(path: string | null | undefined, fallback: string | null | undefined): string | null {
  if (path) return storageUrl("criativos", path) ?? fallback ?? null;
  return fallback ?? null;
}

/** "R$ 97" ou "R$ 97 – 297" (na moeda da página: US$, £, €, ¥...) */
export function priceRange(min: number | string | null, max: number | string | null, currency: string | null = "BRL"): string | null {
  if (min === null || min === undefined) return null;
  const cur = currency || "BRL";
  const a = Number(min), b = Number(max ?? min);
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(cur === "BRL" ? "pt-BR" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: cur === "JPY" ? 0 : 2 });
  } catch {
    fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  }
  const f = (n: number) => fmt.format(n).replace(/[,.]00$/, "");
  if (a === b) return f(a);
  const sym = fmt.formatToParts(0).find((p) => p.type === "currency")?.value ?? "";
  return `${f(a)} – ${f(b).replace(sym, "").trim()}`;
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

export const libraryLink = (q: string, country = "BR") =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&search_type=keyword_unordered&q=${encodeURIComponent(q)}`;

/** "há 45 dias" */
export const daysLabel = (d: number | null | undefined) => (d === null || d === undefined ? "—" : d <= 0 ? "hoje" : d === 1 ? "1 dia" : `${d} dias`);
