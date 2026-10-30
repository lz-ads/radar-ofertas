import type { BrowserContext, Page, Response } from "playwright";
import { jitter, newContext } from "./browser.js";

/* ---------------- Central de Criativos: Top Ads ---------------- */

export interface TopAd {
  id: string;
  country: string;
  adTitle: string;
  brandName: string | null;
  industryKey: string | null;
  objective: string | null;
  likes: number;
  ctr: number | null;
  duration: number | null;
  coverUrl: string | null;
  videoUrl: string | null;
  rank: number;
}

const OBJECTIVES: Record<string, string> = {
  campaign_objective_traffic: "tráfego",
  campaign_objective_conversion: "conversões",
  campaign_objective_product_sales: "vendas de produto",
  campaign_objective_app_install: "instalação de app",
  campaign_objective_video_view: "visualizações",
  campaign_objective_reach: "alcance",
  campaign_objective_lead_generation: "geração de leads",
  campaign_objective_community_interaction: "interação",
  campaign_objective_engagement: "engajamento",
};

/** Melhor vídeo disponível (prefere 720p/540p: qualidade boa e arquivo leve). */
export function pickVideo(urls: Record<string, string> | null | undefined): string | null {
  if (!urls) return null;
  for (const q of ["720p", "540p", "480p", "1080p", "360p"]) if (urls[q]) return urls[q];
  return Object.values(urls)[0] ?? null;
}

/** Lê a resposta de /creative_radar_api/v1/top_ads/v2/list. */
export function parseTopAds(json: unknown, country: string, offset = 0): { ads: TopAd[]; hasMore: boolean; total: number | null } {
  const data = (json as { data?: { materials?: unknown[]; pagination?: { has_more?: boolean; total_count?: number } } })?.data;
  const list = Array.isArray(data?.materials) ? data!.materials : [];
  const ads: TopAd[] = [];
  list.forEach((raw, i) => {
    const m = raw as Record<string, unknown>;
    const v = (m.video_info ?? {}) as { duration?: number; cover?: string; video_url?: Record<string, string> };
    if (!m.id) return;
    ads.push({
      id: String(m.id),
      country,
      adTitle: String(m.ad_title ?? "").trim(),
      brandName: (String(m.brand_name ?? "").trim() || null),
      industryKey: (m.industry_key as string) || null,
      objective: OBJECTIVES[String(m.objective_key)] ?? (m.objective_key ? String(m.objective_key).replace(/^campaign_objective_/, "").replace(/_/g, " ") : null),
      likes: Number(m.like ?? 0) || 0,
      ctr: typeof m.ctr === "number" ? m.ctr : null,
      duration: typeof v.duration === "number" ? v.duration : null,
      coverUrl: v.cover ?? null,
      videoUrl: pickVideo(v.video_url),
      rank: offset + i + 1,
    });
  });
  return { ads, hasMore: !!data?.pagination?.has_more, total: data?.pagination?.total_count ?? null };
}

/**
 * Procura, em qualquer resposta da Central de Criativos, pares "label_123" -> nome do setor.
 * (A lista de filtros traz os setores; o formato exato muda, então a busca é genérica.)
 */
export function collectIndustryNames(json: unknown, out: Map<string, string> = new Map()): Map<string, string> {
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const id = [o.id, o.key, o.value, o.industry_key, o.label_key].find((x) => typeof x === "string" && /^label_\d+$/.test(x)) as string | undefined;
    const name = [o.label, o.name, o.value_name, o.text, o.title].find((x) => typeof x === "string" && !/^label_\d+$/.test(x) && x.trim()) as string | undefined;
    if (id && name) out.set(id, name.trim());
    for (const x of Object.values(o)) if (x && typeof x === "object") walk(x);
  };
  walk(json);
  return out;
}

export function topAdsUrl(country: string, period = 30) {
  return `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/pt?period=${period}&region=${country}&sort_by=like`;
}

/* ---------------- Biblioteca de Conteúdo Comercial (Europa) ---------------- */

/** Países cobertos pela biblioteca do TikTok (lei europeia): Europa + Reino Unido + Turquia. */
export const TIKTOK_LIBRARY_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT",
  "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "TR", "GB",
]);

export interface LibraryAd {
  id: string;
  advertiser: string;
  title: string;
  firstShown: string | null; // yyyy-mm-dd
  lastShown: string | null;
  audience: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
}

const isoDay = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : null);

/** Lê a resposta de library.tiktok.com/api/v1/search. */
export function parseLibrary(json: unknown): { total: number | null; ads: LibraryAd[] } {
  const j = json as { total?: number; data?: unknown[] };
  const ads: LibraryAd[] = [];
  for (const raw of Array.isArray(j?.data) ? j.data : []) {
    const a = raw as Record<string, unknown>;
    if (!a.id) continue;
    const videos = (Array.isArray(a.videos) ? a.videos : []) as { video_url?: string; cover_img?: string }[];
    const images = (Array.isArray(a.image_urls) ? a.image_urls : []) as string[];
    ads.push({
      id: String(a.id),
      advertiser: String(a.name ?? "").trim(),
      title: String(a.title ?? "").trim(),
      firstShown: isoDay(a.first_shown_date),
      lastShown: isoDay(a.last_shown_date),
      audience: (a.estimated_audience as string) || null,
      coverUrl: videos[0]?.cover_img ?? images[0] ?? null,
      videoUrl: videos[0]?.video_url ?? null,
    });
  }
  return { total: typeof j?.total === "number" ? j.total : null, ads };
}

/** Termo de busca na biblioteca: nome do anunciante, ou o nome do site sem o ".com" ("gymshark.com" -> "gymshark"). */
export function libraryTerm(term: string, label: string): string {
  const t = term.trim().toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t)) return t.split(".")[0];
  return (label || term).trim();
}

export function libraryUrl(term: string, region: string, now = Date.now()) {
  const end = now;
  const start = now - 30 * 864e5;
  const p = new URLSearchParams({
    region, start_time: String(start), end_time: String(end), adv_name: term, adv_biz_ids: "",
    query_type: "1", sort_type: "last_shown_date,desc",
  });
  return `https://library.tiktok.com/ads?${p.toString()}`;
}

/* ---------------- Navegador ---------------- */

/** Robô do TikTok: abre as páginas públicas e lê as respostas que a própria página recebe. */
export class TikTokSource {
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;
  industries = new Map<string, string>();

  private async getPage() {
    if (!this.page) {
      this.ctx = await newContext("pt-BR");
      this.page = await this.ctx.newPage();
    }
    return this.page;
  }

  /** Top Ads de um país: carrega a lista e clica em "Ver mais" até `maxPages` páginas de 20. */
  async topAds(country: string, maxPages = 6): Promise<{ ads: TopAd[]; total: number | null }> {
    const page = await this.getPage();
    const byId = new Map<string, TopAd>();
    let total: number | null = null;
    let hasMore = true;
    let pagesSeen = 0;
    const onResponse = async (res: Response) => {
      const u = res.url();
      if (!u.includes("creative_radar_api")) return;
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return;
      }
      collectIndustryNames(json, this.industries);
      if (!u.includes("/top_ads/v2/list")) return;
      const pageNo = Number(new URL(u).searchParams.get("page") || "1");
      const limit = Number(new URL(u).searchParams.get("limit") || "20");
      const r = parseTopAds(json, country, (pageNo - 1) * limit);
      for (const a of r.ads) if (!byId.has(a.id)) byId.set(a.id, a);
      total = r.total ?? total;
      hasMore = r.hasMore;
      pagesSeen++;
    };
    page.on("response", onResponse);
    try {
      await page.goto(topAdsUrl(country), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      for (let i = 0; i < maxPages - 1 && hasMore; i++) {
        const before = pagesSeen;
        // clica pelo JavaScript: o pop-up de propaganda da própria página não atrapalha
        const clicked = await page
          .evaluate(() => {
            const el = Array.from(document.querySelectorAll("div,button,span")).find(
              (e) => e.childElementCount === 0 && /^(Ver mais|View more|Ver Mais)$/.test((e.textContent || "").trim()),
            ) as HTMLElement | undefined;
            el?.click();
            return !!el;
          })
          .catch(() => false);
        if (!clicked) break;
        for (let w = 0; w < 10 && pagesSeen === before; w++) await page.waitForTimeout(500);
        if (pagesSeen === before) break;
        await jitter(800, 1500);
      }
    } finally {
      page.off("response", onResponse);
    }
    return { ads: [...byId.values()], total };
  }

  /** Biblioteca europeia: anúncios dos últimos 30 dias de um anunciante (ou palavra) num país. */
  async library(term: string, region: string): Promise<{ total: number | null; ads: LibraryAd[] }> {
    const page = await this.getPage();
    let result: { total: number | null; ads: LibraryAd[] } | null = null;
    const onResponse = async (res: Response) => {
      if (!res.url().includes("/api/v1/search")) return;
      try {
        const r = parseLibrary(await res.json());
        if (!result) result = r;
        else result = { total: r.total ?? result.total, ads: [...result.ads, ...r.ads] };
      } catch {
        /* resposta que não é JSON */
      }
    };
    page.on("response", onResponse);
    try {
      await page.goto(libraryUrl(term, region), { waitUntil: "domcontentloaded", timeout: 60_000 });
      for (let i = 0; i < 30 && !result; i++) await page.waitForTimeout(500);
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    } finally {
      page.off("response", onResponse);
    }
    return result ?? { total: null, ads: [] };
  }

  async close() {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
