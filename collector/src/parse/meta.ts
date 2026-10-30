import type { DestType, MetaAd } from "../types.js";

const MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

/** "29 de set de 2026" -> "2026-09-29" */
export function parsePtDate(s: string): string | null {
  const m = s.match(/(\d{1,2}) de ([a-zç]{3})\.? de (\d{4})/i);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}

const DOMAIN_LINE = /^[A-Z0-9.-]+\.[A-Z]{2,}(\.[A-Z]{2})?$/;

/** Botões de ação que a Meta mostra no card (português e inglês). */
const CTA =
  /^(Shop Now|Learn More|Install Now|Use App|Sign Up|Subscribe|Book Now|Download|Watch More|Get Offer|Get Quote|Apply Now|Contact Us|Call Now|Order Now|Send Message|Send WhatsApp Message|WhatsApp|Play Game|Listen Now|Get Directions|See Menu|Saiba mais|Comprar agora|Compre agora|Enviar mensagem|Enviar mensagem pelo WhatsApp|Cadastre-se|Inscreva-se|Assinar|Reservar|Baixar|Instalar agora|Usar app|Obter oferta|Obter cotação|Solicitar agora|Fale conosco|Ligar agora|Pedir agora|Ver cardápio|Assistir mais|Jogar|Ouvir agora|Como chegar)$/i;

/**
 * Converte o texto visível da página de resultados da Biblioteca de Anúncios
 * (document.body.innerText) em uma lista de anúncios.
 */
export function parseMetaLibraryText(text: string): { total: string | null; ads: MetaAd[] } {
  const total = (text.match(/[>~]?[\d.]+ resultados/) || [null])[0];
  const chunks = text.split("Identificação da biblioteca: ").slice(1);
  const ads: MetaAd[] = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((l) => l.replace(/​/g, "").trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const libraryId = (lines[0].match(/^\d+/) || [""])[0];
    if (!libraryId) continue;

    const startLine = lines.find((l) => l.startsWith("Veiculação iniciada em")) || "";
    const startDate = parsePtDate(startLine);
    const copies = Number((chunk.match(/(\d+) anúncios usam/) || [])[1] || 1);

    const pi = lines.findIndex((l) => l === "Patrocinado");
    if (pi <= 0) continue;
    const advertiser = lines[pi - 1];

    const after = lines.slice(pi + 1);
    const domainLine = after.find((l) => DOMAIN_LINE.test(l)) || null;
    const cta = after.find((l) => CTA.test(l)) ?? null;
    const bodyLines: string[] = [];
    for (const l of after) {
      if (DOMAIN_LINE.test(l) || CTA.test(l) || /^\d+:\d+ \/ \d+:\d+$/.test(l) || l === "Ativo") break;
      bodyLines.push(l);
      if (bodyLines.join(" ").length > 400) break;
    }

    ads.push({
      libraryId,
      advertiser,
      domain: domainLine ? domainLine.toLowerCase().replace(/^www\./, "") : null,
      body: bodyLines.join("\n").slice(0, 600),
      startDate,
      copies: Number.isFinite(copies) && copies > 0 ? copies : 1,
      cta,
    });
  }
  return { total, ads };
}

/** Domínios que não identificam uma oferta (apps, redes, encurtadores). */
const GENERIC_DOMAINS = [
  "api.whatsapp.com", "whatsapp.com", "wa.me", "instagram.com", "facebook.com", "fb.com", "fb.me",
  "play.google.com", "itunes.apple.com", "apps.apple.com", "m.me", "linktr.ee", "bit.ly",
  "youtube.com", "youtu.be", "tiktok.com", "google.com", "forms.gle", "t.me", "beacons.ai", "bio.link",
];

/**
 * Plataformas onde cada cliente ganha um subdomínio (loja.myshopify.com) ou um link com caminho
 * (pay.hotmart.com/ABC). O domínio raiz não identifica a oferta.
 */
const PLATFORM_DOMAINS = [
  "myshopify.com", "nuvemshop.com.br", "lojavirtualnuvem.com.br", "mitiendanube.com", "tiendanube.com",
  "wixsite.com", "vercel.app", "netlify.app", "pages.dev", "github.io", "carrd.co", "webflow.io",
  "framer.website", "framer.app", "godaddysites.com", "square.site", "blogspot.com", "wordpress.com",
  "hostingersite.com", "elementor.cloud", "canva.site", "systeme.io", "kajabi.com", "mykajabi.com",
  "hotmart.com", "hotmart.host", "kiwify.com.br", "kiwify.app", "eduzz.com", "monetizze.com.br",
  "braip.com", "cartpanda.com", "mycartpanda.com", "yampi.com.br", "yampi.io", "greenn.com.br",
  "ticto.app", "ticto.com.br", "payt.com.br", "kirvano.com", "lastlink.com", "perfectpay.com.br",
  "pepper.com.br", "lpages.co", "leadlovers.com", "rdstation.com", "herospark.com", "builderall.com",
];
const PLATFORM_SHARED_SUBS = new Set(["www", "pay", "checkout", "go", "app", "sun", "chk", "lp", "secure", "payment", "seguro"]);

function platformOf(domain: string): { root: string; sub: string } | null {
  for (const p of PLATFORM_DOMAINS) {
    if (domain === p) return { root: p, sub: "" };
    if (domain.endsWith("." + p)) return { root: p, sub: domain.slice(0, -p.length - 1) };
  }
  return null;
}

export function isGenericDomain(domain: string | null): boolean {
  if (!domain) return true;
  if (GENERIC_DOMAINS.some((g) => domain === g || domain.endsWith("." + g))) return true;
  const p = platformOf(domain);
  return !!p && (!p.sub || PLATFORM_SHARED_SUBS.has(p.sub));
}

export const normalizeName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Domínios com sufixo de dois níveis (loja.com.br, shop.co.uk, kirei.co.jp, store.com.au):
 * a parte própria da loja é a terceira de trás para frente.
 */
export function hasSecondLevelSuffix(domain: string): boolean {
  if (/\.(com|net|org|gov|edu|art|blog|tv|ind|eco|app|dev|log|tec|wiki)\.br$/.test(domain)) return true;
  return /\.(co|com|net|org|gov|edu|ac|ne|or|go|gr|ltd|plc|me|nom|biz|info)\.[a-z]{2}$/.test(domain);
}

/** Chave que agrupa anúncios da mesma oferta: domínio próprio ou, sem ele, o anunciante. */
export function offerKeyFor(ad: Pick<MetaAd, "domain" | "advertiser">): string {
  if (ad.domain && !isGenericDomain(ad.domain)) {
    // loja.myshopify.com fica inteira: cada subdomínio é uma loja diferente
    if (platformOf(ad.domain)) return "d:" + ad.domain;
    // subdomínios de checkout/página continuam na mesma oferta: pilates.site.com -> site.com
    const parts = ad.domain.split(".");
    const keep = hasSecondLevelSuffix(ad.domain) ? 3 : 2;
    return "d:" + parts.slice(-keep).join(".");
  }
  return "a:" + normalizeName(ad.advertiser);
}

/** Para onde o anúncio leva: site, WhatsApp, formulário etc. */
export function destTypeFor(ad: Pick<MetaAd, "domain" | "cta" | "landingUrl">): DestType | null {
  const host = (() => {
    try { return ad.landingUrl ? new URL(ad.landingUrl).hostname.replace(/^www\./, "") : null; } catch { return null; }
  })();
  const d = ad.domain ?? "";
  const cta = (ad.cta ?? "").toLowerCase();
  const isWa = (h: string | null) => !!h && /(^|\.)((api\.)?whatsapp\.com|wa\.me)$/.test(h);
  if (isWa(host) || isWa(d) || cta.includes("whatsapp")) return "whatsapp";
  if (/(^|\.)instagram\.com$/.test(d) || /(^|\.)instagram\.com$/.test(host ?? "")) return "instagram";
  if (/play\.google\.com|apps?\.apple\.com|itunes\.apple\.com/.test(d + " " + (host ?? "")) || /install|instalar|use app|usar app|baixar|download|play game|jogar/.test(cta)) return "app";
  if (host || (d && !isGenericDomain(d))) return "site";
  if (/send message|enviar mensagem/.test(cta)) return "mensagem";
  if (/sign up|cadastre|inscreva|get quote|obter cota|solicitar|subscribe|assinar|apply/.test(cta)) return "formulario";
  if (/call|ligar/.test(cta)) return "ligacao";
  return null;
}
