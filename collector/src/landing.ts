/** Raio-X de uma página de vendas: plataforma, checkout, preços e elementos de conversão. */
export interface LandingInfo {
  url: string;
  finalUrl: string | null;
  status: number | null;
  title: string | null;
  description: string | null;
  platform: string | null;   // onde o site foi feito (Shopify, WordPress...)
  checkout: string | null;   // para onde vai o pagamento (Hotmart, Kiwify, Yampi...)
  prices: number[];
  priceMin: number | null;
  priceMax: number | null;
  installments: string | null; // "12x de R$ 19,90"
  cod: boolean;              // pagamento na entrega
  hasVsl: boolean;
  hasCountdown: boolean;
  hasWhatsapp: boolean;
  pixels: string[];
  excerpt: string | null;    // começo do texto da página (vai para a IA)
  error: string | null;
}

const PLATFORMS: [string, RegExp][] = [
  ["Shopify", /cdn\.shopify\.com|shopify\.theme|myshopify\.com/],
  ["Nuvemshop", /nuvemshop|tiendanube|lojavirtualnuvem/],
  ["Yampi", /yampi/],
  ["Cartpanda", /cartpanda/],
  ["VTEX", /vtex(assets|commercestable|\.com)/],
  ["Loja Integrada", /lojaintegrada/],
  ["Tray", /tray\.com\.br|traycorp/],
  ["WooCommerce", /woocommerce/],
  ["Wix", /wixstatic|wix\.com/],
  ["Webflow", /webflow/],
  ["Framer", /framerusercontent|framer\.(website|app)/],
  ["Hotmart Pages", /hotmart\.(com|host)\/(pages|sales)|hotmart pages/],
  ["Elementor", /elementor/],
  ["WordPress", /wp-content|wp-includes/],
];

const CHECKOUTS: [string, RegExp][] = [
  ["Hotmart", /pay\.hotmart\.com|go\.hotmart\.com|hotmart\.com\/checkout/],
  ["Kiwify", /pay\.kiwify\.com\.br|kiwify\.app/],
  ["Eduzz", /sun\.eduzz\.com|chk\.eduzz\.com|eduzz\.com\/checkout/],
  ["Monetizze", /monetizze/],
  ["Braip", /braip\.com/],
  ["Ticto", /ticto\.(app|com)/],
  ["Greenn", /greenn\.com/],
  ["Kirvano", /kirvano/],
  ["PerfectPay", /perfectpay/],
  ["Lastlink", /lastlink/],
  ["Payt", /payt\.com\.br/],
  ["Pepper", /pepper\.com\.br/],
  ["Logzz", /logzz/],
  ["Coinzz", /coinzz/],
  ["Appmax", /appmax/],
  ["Cartpanda", /cartpanda/],
  ["Yampi", /yampi/],
  ["Shopify", /checkout\.shopify|cdn\.shopify\.com/],
  ["Mercado Pago", /mercadopago/],
  ["Pagar.me", /pagar\.me/],
  ["Stripe", /js\.stripe\.com|checkout\.stripe/],
];

const PIXELS: [string, RegExp][] = [
  ["Meta", /fbq\(|connect\.facebook\.net\/[^"']*fbevents/],
  ["TikTok", /analytics\.tiktok\.com|ttq\.load/],
  ["Google Ads", /googleadservices|gtag\([^)]*['"]AW-/],
  ["Google Analytics", /googletagmanager\.com\/gtag|gtag\([^)]*['"]G-/],
  ["GTM", /googletagmanager\.com\/gtm/],
  ["Kwai", /kwai/],
  ["Taboola", /taboola/],
  ["Utmify", /utmify/],
  ["Clarity", /clarity\.ms/],
  ["Hotjar", /hotjar/],
];

/** "1.297,90" -> 1297.9 */
export function brl(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

/** Preços em reais do texto, separando parcelas ("12x de R$ 19,90"). */
export function extractPrices(text: string): { prices: number[]; installments: string | null } {
  const prices: number[] = [];
  let installments: string | null = null;
  const re = /(?:(\d{1,2})\s?x\s?(?:de\s)?)?R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = brl(m[2]);
    if (!Number.isFinite(v) || v < 1 || v > 50000) continue;
    if (m[1]) {
      installments ??= `${m[1]}x de R$ ${m[2]}`;
      continue;
    }
    prices.push(v);
  }
  return { prices: [...new Set(prices)].sort((a, b) => a - b).slice(0, 12), installments };
}

/** Analisa o HTML e o texto visível de uma página (função pura, testável). */
export function analyzeLanding(url: string, html: string, text: string, finalUrl: string | null = null, status: number | null = null): LandingInfo {
  const h = html.toLowerCase();
  const first = <T,>(list: [T, RegExp][]) => list.find(([, re]) => re.test(h))?.[0] ?? null;
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']{1,300})`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,300})["'][^>]+(?:name|property)=["']${name}["']`, "i"))?.[1] ?? null;
  const title = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? meta("og:title"))?.trim() ?? null;
  const { prices, installments } = extractPrices(text);
  // o checkout da própria plataforma do site não conta como "checkout externo" quando é o mesmo
  const platform = first(PLATFORMS);
  const checkout = first(CHECKOUTS);
  return {
    url,
    finalUrl,
    status,
    title,
    description: meta("description") ?? meta("og:description"),
    platform,
    checkout,
    prices,
    priceMin: prices[0] ?? null,
    priceMax: prices.length ? prices[prices.length - 1] : null,
    installments,
    cod: /pag(ue|amento)\s+(somente\s+|s[óo]\s+|apenas\s+)?(na|no ato da)\s+entrega|receba\s+(antes|primeiro)[,\s]+(e\s+)?pague\s+depois/i.test(text) || /logzz|coinzz/.test(h),
    hasVsl: /vturb|converteai|pandavideo|player\.vimeo|youtube\.com\/embed|youtube-nocookie|wistia|smartplayer|scripts\.converteai/.test(h),
    hasCountdown: /countdown|cronometro|cronômetro|contador regressivo/.test(h) || /(oferta|promoção|desconto)\s+(termina|expira|acaba)/i.test(text),
    hasWhatsapp: /wa\.me\/|api\.whatsapp\.com\/send/.test(h),
    pixels: PIXELS.filter(([, re]) => re.test(h)).map(([n]) => n),
    excerpt: text.replace(/\s+/g, " ").trim().slice(0, 1500) || null,
    error: null,
  };
}

/** Só vale visitar páginas de site (não WhatsApp, Instagram, lojas de app). */
export function isVisitable(url: string | null): url is string {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return !/(^|\.)(whatsapp\.com|wa\.me|instagram\.com|facebook\.com|play\.google\.com|apple\.com|t\.me)$/.test(host);
  } catch {
    return false;
  }
}
