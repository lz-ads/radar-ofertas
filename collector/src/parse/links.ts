/** Parâmetros de rastreio que não fazem parte do endereço da oferta. */
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|ttclid|_fbc|_fbp|campaign_id|adset_id|ad_id|placement|site_source_name|src|xcod|sck)$/i;

/**
 * Converte o link do Facebook (l.facebook.com/l.php?u=...) no endereço real da página,
 * sem parâmetros de rastreio. Retorna null para links que não são de destino.
 */
export function cleanLandingUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
    if (/(^|\.)l\.facebook\.com$|(^|\.)lm\.facebook\.com$/.test(url.hostname) && url.searchParams.get("u")) {
      url = new URL(url.searchParams.get("u")!);
    }
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)instagram\.com$/.test(url.hostname)) return null;
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  url.hash = "";
  const s = url.toString();
  return s.endsWith("?") ? s.slice(0, -1) : s;
}

/** Página do anunciante no Facebook (só o perfil, sem parâmetros). */
export function cleanPageUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (!/(^|\.)facebook\.com$/.test(url.hostname)) return null;
    const first = url.pathname.split("/").filter(Boolean)[0];
    if (!first || ["ads", "l.php", "help", "policies", "privacy"].includes(first)) return null;
    return `https://www.facebook.com/${first}/`;
  } catch {
    return null;
  }
}

/** Domínio (sem www) de uma URL. */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export type CardLinks = Record<string, { page: string | null; landing: string | null; thumb: string | null; media: "image" | "video" | null }>;

/**
 * Script que roda dentro da página da Biblioteca: para cada card, devolve página do anunciante,
 * link de destino e imagem do criativo. Fica em texto puro para o compilador não alterá-lo.
 */
export const CARD_LINKS_SCRIPT = `(() => {
  const out = {};
  const labels = Array.from(document.querySelectorAll("span,div")).filter(
    (e) => e.childElementCount === 0 && /^Identificação da biblioteca: \\d+/.test((e.textContent || "").trim()));
  for (const el of labels) {
    const id = ((el.textContent || "").match(/\\d+/) || [""])[0];
    let card = el;
    for (let i = 0; i < 16 && card; i++) {
      card = card.parentElement;
      if (card && card.querySelectorAll("a").length >= 1 && (card.innerText || "").includes("Patrocinado")) break;
    }
    if (!card || !id) continue;
    const anchors = Array.from(card.querySelectorAll("a"));
    const page = (anchors.find((a) => /^https:\\/\\/(www\\.)?facebook\\.com\\/[^/?#]+\\/?$/.test(a.href)) || {}).href || null;
    const landing = (anchors.find((a) => /l\\.facebook\\.com\\/l\\.php\\?u=/.test(a.href)) || {}).href || null;
    const video = card.querySelector("video");
    const img = Array.from(card.querySelectorAll("img")).find((i) => (i.naturalWidth || i.width) > 120);
    out[id] = { page, landing, thumb: (video && video.poster) || (img && img.src) || null, media: video ? "video" : img ? "image" : null };
  }
  return out;
})()`;
