import "server-only";
import { COUNTRIES, countryName } from "./db";
import { daysSince, groupAds, type SearchAdRow, type SearchGroup } from "./pesquisa";

/**
 * Pesquisa por nicho: o nicho ("bet / cassino online") vira várias palavras que aparecem
 * no TEXTO dos anúncios. O robô busca cada uma na Biblioteca da Meta e junta tudo.
 */

export const MAX_TERMS = 10;

export interface TermStat {
  term: string;
  total: string | null;
  ads: number;
  error?: string;
}

/** Pacotes prontos (funcionam mesmo sem a IA). A IA completa ou substitui quando estiver ligada. */
const PRESETS: { test: RegExp; country?: string[]; terms: string[] }[] = [
  {
    test: /\b(bets?|apostas?|cassinos?|casinos?|slots?|igaming|tigrinho|roleta)\b/i,
    country: ["BR"],
    terms: ["cassino online", "rodadas grátis", "bônus de boas-vindas", "giros grátis", "aposta grátis", "saque via pix", "apostas esportivas", "jogo do tigrinho", "slots", "bet"],
  },
  {
    test: /\b(bets?|betting|casinos?|slots?|igaming|sportsbook|gambling)\b/i,
    country: ["US", "GB", "CA", "AU"],
    terms: ["online casino", "free spins", "welcome bonus", "sportsbook", "bet now", "no deposit bonus", "free bet", "slots", "sign up bonus", "casino"],
  },
  {
    test: /\b(emagrec\w*|perder peso|secar|barriga)\b/i,
    country: ["BR"],
    terms: ["emagrecer", "perder peso", "secar barriga", "queimar gordura", "inchaço", "sem dieta", "chá para emagrecer", "cápsulas", "desinchar", "metabolismo"],
  },
  {
    test: /\b(renda extra|ganhar dinheiro|trabalhar em casa|afiliad\w*)\b/i,
    country: ["BR"],
    terms: ["renda extra", "ganhar dinheiro", "trabalhar de casa", "pelo celular", "mesmo sem experiência", "primeira venda", "marketing digital", "afiliado", "dinheiro online", "comissão"],
  },
];

/** Palavras do pacote pronto para o nicho, se houver. */
export function presetTerms(niche: string, country: string): string[] {
  const p = PRESETS.find((x) => x.test.test(niche) && (!x.country || x.country.includes(country)));
  return p ? [...p.terms] : [];
}

/** Limpa uma lista de palavras (texto livre separado por vírgula ou linha, ou array). */
export function cleanTerms(raw: string | string[], max = MAX_TERMS): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,\n;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of list) {
    const t = String(r).replace(/["“”#*`]/g, "").replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
    if (t.length < 2 || t.split(" ").length > 5 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Pede à IA as palavras do nicho. A resposta vem como lista JSON (ou uma por linha). */
export function termsPrompt(niche: string, country: string): string {
  const c = COUNTRIES[country];
  return [
    `Um gestor de tráfego quer mapear os anúncios ATIVOS do nicho "${niche}" na Biblioteca de Anúncios da Meta, país: ${countryName(country)}.`,
    "A busca da biblioteca procura a FRASE EXATA dentro do texto do anúncio. Liste as palavras e frases curtas que os anunciantes desse nicho",
    `mais escrevem nos anúncios, no idioma usado nesse país (${c?.locale ?? "pt-BR"}).`,
    "Regras:",
    `- de 8 a ${MAX_TERMS} itens, cada um com 1 a 4 palavras;`,
    "- comece pelo nome mais comum do nicho e depois as frases de oferta, gancho e chamada típicas (ex.: bônus, garantia, forma de pagamento);",
    "- nada de nomes de marcas ou empresas, nada genérico demais que pegue qualquer nicho (ex.: \"compre agora\", \"frete grátis\");",
    "- sem repetir variações quase iguais.",
    'Responda SÓ com uma lista JSON de strings, ex.: ["cassino online","rodadas grátis"].',
  ].join("\n");
}

export function parseTermsReply(text: string): string[] {
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (json) {
    try {
      const arr = JSON.parse(json) as unknown;
      if (Array.isArray(arr)) return cleanTerms(arr.map(String));
    } catch {
      /* cai para uma por linha */
    }
  }
  return cleanTerms(text);
}

/* ---------------- Resultado ---------------- */

export interface NicheGroup extends SearchGroup {
  terms: string[];   // palavras do nicho em que o anunciante apareceu
  days: number | null;
  force: number;     // força no nicho (ordena a lista)
  newcomer: boolean; // entrou há pouco e já tem volume
}

/**
 * Agrupa por anunciante e ordena pela força no nicho:
 * anúncios ativos + cópias + 5 × palavras diferentes em que aparece (quem aparece em várias é player central).
 */
export function groupNiche(ads: SearchAdRow[]): NicheGroup[] {
  return groupAds(ads)
    .map((g) => {
      const terms = [...new Set(g.ads.flatMap((a) => a.terms ?? []))];
      const days = daysSince(g.oldest);
      const force = g.ads.length + g.copies + 5 * terms.length;
      return { ...g, terms, days, force, newcomer: days !== null && days <= 14 && g.copies >= 5 };
    })
    .sort((a, b) => b.force - a.force);
}

/** Números gerais do resultado. */
export function nicheSummary(groups: NicheGroup[]) {
  const ads = groups.reduce((s, g) => s + g.ads.length, 0);
  const copies = groups.reduce((s, g) => s + g.copies, 0);
  const top5 = groups.slice(0, 5).reduce((s, g) => s + g.copies, 0);
  const dest = new Map<string, number>();
  const cta = new Map<string, number>();
  for (const g of groups)
    for (const a of g.ads) {
      if (a.dest_type) dest.set(a.dest_type, (dest.get(a.dest_type) ?? 0) + 1);
      if (a.cta) cta.set(a.cta, (cta.get(a.cta) ?? 0) + 1);
    }
  const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  return {
    ads,
    copies,
    advertisers: groups.length,
    concentration: copies ? Math.round((top5 / copies) * 100) : 0, // % das cópias nas mãos dos 5 maiores
    newcomers: groups.filter((g) => g.newcomer).length,
    dest: top(dest),
    cta: top(cta),
  };
}

/** Prompt do raio-X do nicho (a IA lê os anunciantes e anúncios encontrados). */
export function analysisPrompt(o: { niche: string; country: string; stats: TermStat[]; groups: NicheGroup[] }): string {
  const s = nicheSummary(o.groups);
  const players = o.groups.slice(0, 25).map((g) => ({
    anunciante: g.advertiser,
    site: g.domain,
    anuncios_ativos: g.ads.length,
    copias: g.copies,
    palavras: g.terms,
    no_ar_ha_dias: g.days,
    destinos: [...new Set(g.ads.map((a) => a.dest_type).filter(Boolean))],
    botoes: [...new Set(g.ads.map((a) => a.cta).filter(Boolean))].slice(0, 3),
    textos: g.ads
      .slice()
      .sort((a, b) => b.copies - a.copies)
      .slice(0, 2)
      .map((a) => (a.body ?? "").replace(/\s+/g, " ").slice(0, 350))
      .filter(Boolean),
  }));
  const betHint = /\b(bets?|apostas?|cassinos?|casinos?|slots?|igaming|tigrinho|gambling|sportsbook)\b/i.test(o.niche)
    ? o.country === "BR"
      ? "Nicho de apostas: no Brasil só casas autorizadas pelo governo podem anunciar e elas usam domínio .bet.br; diga quais anunciantes usam .bet.br e quais não (sem acusar ninguém, só o que dá para ver). Lembre que a Meta exige autorização prévia para anúncios de jogos de azar."
      : "Nicho de apostas: lembre que a Meta exige autorização prévia para anúncios de jogos de azar e que as regras mudam por país."
    : "";
  return [
    "Você é um estrategista de tráfego pago. Faça um raio-X de mercado do nicho abaixo usando SÓ os anúncios ativos encontrados na Biblioteca de Anúncios da Meta.",
    `Nicho: ${o.niche} · País: ${countryName(o.country)}.`,
    "Responda em português do Brasil, em Markdown, direto ao ponto, com bullets curtos. Não invente números, empresas ou dados que não estão aqui; quando algo não der para saber, diga.",
    betHint,
    "",
    "Entregue nesta ordem:",
    "## Resumo (tamanho e maturidade do nicho, concorrência, se está concentrado em poucos players)",
    "## Quem domina (os 5 a 8 principais e o que cada um faz de diferente)",
    "## Quem está entrando forte (no ar há pouco tempo com muitas cópias)",
    "## Ângulos e promessas que mais se repetem",
    "## Ganchos e estilo de texto (como os anúncios abrem, tom, emojis, provas)",
    "## Estrutura de oferta (bônus, preço, garantia, pagamento, botão e destino: site, WhatsApp, app...)",
    "## Brechas e oportunidades (ângulos pouco usados, públicos esquecidos)",
    "## Riscos de política e regulação",
    "## Próximos passos (3 anunciantes para espionar, 5 palavras novas para acompanhar, 3 ideias de teste)",
    "",
    `Números: ${s.ads} anúncios ativos lidos, ${s.copies} cópias, ${s.advertisers} anunciantes; os 5 maiores têm ${s.concentration}% das cópias.`,
    `Palavras buscadas (o que a Meta mostrou de total em cada uma): ${o.stats.map((t) => `${t.term} = ${t.error ? "falhou" : t.total ?? `${t.ads} lidos`}`).join("; ")}.`,
    "",
    "Anunciantes (ordenados pela força no nicho):",
    JSON.stringify(players),
  ]
    .filter((l) => l !== "")
    .join("\n");
}
