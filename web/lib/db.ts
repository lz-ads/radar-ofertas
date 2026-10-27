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
