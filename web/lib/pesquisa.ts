import "server-only";

export type SearchStatus = "pendente" | "rodando" | "pronta" | "erro";

export interface SearchRow {
  id: number;
  term: string;
  kind: "palavra" | "site";
  match: "exata" | "qualquer";
  country: string;
  status: SearchStatus;
  total_results: string | null;
  ads_found: number | null;
  offers_found: number | null;
  google_ads: number | null;
  message: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SearchAdRow {
  library_id: string;
  position: number;
  offer_key: string;
  advertiser: string;
  domain: string | null;
  body: string | null;
  start_date: string | null;
  copies: number;
  cta: string | null;
  dest_type: string | null;
  page_url: string | null;
  landing_url: string | null;
  thumb_url: string | null;
  thumb_path: string | null;
  media_type: string | null;
  site_match: boolean | null;
}

/** "https://www.Loja.com.br/produto?x=1" -> "loja.com.br"; frase com espaço -> null (mesma regra do robô) */
export function siteOf(term: string): string | null {
  const t = term.trim().toLowerCase();
  if (!t || /\s/.test(t)) return null;
  const host = t.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return /[a-z]{2,}$/.test(host) ? host : null;
}

/**
 * Liga o robô na hora: dispara o workflow "Pesquisar agora" no GitHub Actions.
 * Devolve null quando deu certo, ou o motivo (a pesquisa então roda na próxima coleta automática).
 */
export async function dispatchSearch(id: number): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return "GITHUB_TOKEN não está configurado na Vercel, então o robô não liga na hora: a pesquisa roda na próxima coleta automática (6h, 12h ou 18h).";
  const repo = process.env.GITHUB_REPO || "lz-ads/radar-ofertas";
  const ref = process.env.GITHUB_BRANCH || "main";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pesquisar.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { id: String(id) } }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) return null;
    const body = (await res.text()).slice(0, 200);
    const hint =
      res.status === 401 ? " (token inválido ou vencido)" :
      res.status === 403 || res.status === 404 ? " (o token precisa da permissão Actions: leitura e escrita neste repositório)" :
      res.status === 422 ? " (o workflow pesquisar.yml ainda não está no GitHub)" : "";
    return `O GitHub recusou ligar o robô: ${res.status}${hint}. ${body} A pesquisa roda na próxima coleta automática.`;
  } catch (e) {
    return `Não consegui falar com o GitHub (${(e as Error).message}). A pesquisa roda na próxima coleta automática.`;
  }
}

/** Uma oferta (anunciante/site) dentro do resultado da pesquisa. */
export interface SearchGroup {
  key: string;
  advertiser: string;
  domain: string | null;
  ads: SearchAdRow[];
  copies: number;
  oldest: string | null;
  siteMatch: boolean;
  thumb: SearchAdRow | null;
  landing: string | null;
}

/** Agrupa os anúncios por oferta, na ordem em que a Meta mostrou (mais vistos primeiro). */
export function groupAds(ads: SearchAdRow[]): SearchGroup[] {
  const map = new Map<string, SearchAdRow[]>();
  for (const a of [...ads].sort((x, y) => x.position - y.position)) {
    const list = map.get(a.offer_key) ?? [];
    list.push(a);
    map.set(a.offer_key, list);
  }
  return [...map.entries()].map(([key, list]) => {
    const names = new Map<string, number>();
    for (const a of list) names.set(a.advertiser, (names.get(a.advertiser) ?? 0) + a.copies);
    const advertiser = [...names.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const starts = list.map((a) => a.start_date).filter((d): d is string => !!d).sort();
    return {
      key,
      advertiser,
      domain: list.find((a) => a.domain)?.domain ?? null,
      ads: list,
      copies: list.reduce((s, a) => s + (a.copies || 1), 0),
      oldest: starts[0] ?? null,
      siteMatch: list.some((a) => a.site_match),
      thumb: list.find((a) => a.thumb_path || a.thumb_url) ?? null,
      landing: list.find((a) => a.landing_url)?.landing_url ?? null,
    };
  });
}

/** Dias desde a data (yyyy-mm-dd). */
export const daysSince = (d: string | null) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(d + "T12:00:00Z")) / 864e5)) : null);
