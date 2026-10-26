import type { MetaAd } from "../types.js";

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
const CTA = /^(Shop Now|Learn More|Install Now|Use App|Sign Up|Saiba mais|Comprar agora|Enviar mensagem|Send Message|Book Now|Download|Watch More|Get Offer|Apply Now|Contact Us)$/i;

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
    });
  }
  return { total, ads };
}

/** Domínios que não identificam uma oferta (apps, redes, encurtadores). */
const GENERIC_DOMAINS = [
  "api.whatsapp.com", "wa.me", "instagram.com", "facebook.com", "fb.com", "fb.me",
  "play.google.com", "itunes.apple.com", "apps.apple.com", "m.me", "linktr.ee",
  "bit.ly", "youtube.com", "tiktok.com",
];

export function isGenericDomain(domain: string | null): boolean {
  if (!domain) return true;
  return GENERIC_DOMAINS.some((g) => domain === g || domain.endsWith("." + g));
}

/** Chave que agrupa anúncios da mesma oferta: domínio próprio ou, sem ele, o anunciante. */
export function offerKeyFor(ad: Pick<MetaAd, "domain" | "advertiser">): string {
  if (ad.domain && !isGenericDomain(ad.domain)) {
    // subdomínios de checkout/página continuam na mesma oferta: pilates.site.com -> site.com
    const parts = ad.domain.split(".");
    const keep = /\.(com|net|org|gov|edu)\.br$/.test(ad.domain) ? 3 : 2;
    return "d:" + parts.slice(-keep).join(".");
  }
  return "a:" + ad.advertiser.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
