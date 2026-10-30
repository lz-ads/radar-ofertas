/**
 * Modo demonstração (RADAR_DEMO=1): dados de exemplo no lugar do Supabase,
 * para ver o painel localmente ou mostrar a alguém sem expor o banco.
 * Os exemplos vêm da pesquisa manual de 26/10/2026.
 */
type Row = Record<string, unknown>;

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/** Raio-X, IA e funil de exemplo para algumas ofertas. */
const EXTRA: Record<string, Row> = {
  "d:constlivre.com.br": {
    platform: "Shopify", checkout: "Yampi", price_min: 197, price_max: 497, installments: "12x de R$ 41,42", has_vsl: true, pixels: ["Meta", "TikTok", "GTM", "Kwai"],
    niche: "Emagrecimento", kind: "nutra", audience: "adultos que querem perder barriga", promise: "Desinchar e perder barriga em 90 dias com rotina simples",
    mechanism: "Fibras e ativos que regulam o intestino", offer: "Compre 2 leve 3, frete grátis e garantia de 30 dias", risk: "medio", risk_reason: "promessa de emagrecimento com prazo",
    status: "testando", note: "Modelar o ângulo do desafio de 90 dias com influenciador.",
  },
  "d:laystrancoso.com": {
    platform: "WordPress", checkout: "Hotmart", price_min: 47, price_max: 97, has_vsl: true, pixels: ["Meta"],
    niche: "Fitness", kind: "infoproduto", audience: "mulheres 50+", promise: "Aliviar dores e emagrecer com pilates em casa", mechanism: "Desafio de 7 dias com aulas ao vivo",
    offer: "Desafio por R$ 47 com acesso imediato", risk: "baixo", risk_reason: "sem promessa médica direta", status: "favorita",
  },
  "d:kokeshi.com.br": {
    platform: "Nuvemshop", checkout: "Nuvemshop", price_min: 89.9, price_max: 249.9, cod: false, pixels: ["Meta", "Google Ads"],
    niche: "Beleza e skincare", kind: "produto fisico", promise: "Pele de porcelana com rotina coreana", risk: "baixo", status: "analisando",
  },
  "d:brmoveis.com.br": { platform: "WooCommerce", price_min: 899, price_max: 2490, cod: true, niche: "Casa e decoração", kind: "produto fisico", promise: "Móveis direto da fábrica com pagamento na entrega", risk: "baixo" },
  "d:alwaysfit.com.br": { niche: "Saúde e bem-estar", kind: "nutra", promise: "Mais energia e cabelo forte com suplemento", risk: "alto", risk_reason: "alegações de saúde sem comprovação" },
  "us:d:glowpatch.com": { platform: "Shopify", checkout: "Shopify", price_min: 39.95, price_max: 89.9, has_vsl: false, pixels: ["Meta", "TikTok"], niche: "Emagrecimento", kind: "produto fisico", promise: "Patch that curbs cravings in 2 weeks", risk: "alto", risk_reason: "promessa de emagrecimento", status: "analisando" },
  "jp:d:kireilab.jp": { platform: "Shopify", price_min: 980, price_max: 9800, niche: "Beleza e skincare", kind: "produto fisico", promise: "Pele hidratada com rotina simples (assinatura)", risk: "baixo" },
  "d:benditacanfora.com.br": { platform: "Shopify", checkout: "Cartpanda", price_min: 59.9, price_max: 119.7, niche: "Casa e decoração", kind: "produto fisico", promise: "Acabar com mofo e umidade em armários", risk: "baixo", status: "descartada", discarded: true },
};

const OFFERS: Row[] = [
  ["d:constlivre.com.br", "ConstLivre", ["ConstLivre", "Juju Salimeni", "Renato Cariani"], "constlivre.com.br", 20, 33, 3, "2026-07-20", ["compre 2 leve 3", "emagrecer"], "🚨 O Desafio 90 Dias ConstLivre está com uma oportunidade imperdível: Compre 2 LEVE 3 🔥", 21, 300],
  ["d:laystrancoso.com", "Lays Sant'anna", ["Lays Sant'anna"], "laystrancoso.com", 17, 45, 1, "2026-05-20", ["emagrecer", "menopausa", "dores"], "Vem aí o desafio pilates em casa 50+! Uma semana de aulas AO VIVO de pilates em casa.", 31, 0],
  ["d:kokeshi.com.br", "Kokeshi Beauty", ["Kokeshi Beauty", "Kokeshi", "Kokeshi Skincare Porcelana", "Kokeshi Skincare Pele"], "kokeshi.com.br", 7, 28, 4, "2026-06-27", ["colágeno"], "✨ Descubra a Pele de Porcelana! ✨ Transforme sua pele com nossa linha exclusiva de cosméticos.", 19, 700],
  ["a:help global brazil", "Help Global Brazil", ["Help Global Brazil"], null, 9, 35, 1, "2026-07-15", ["receitas"], "Atendimento médico 24h sem sair de casa por apenas R$ 25,00. Inicie sua consulta em segundos.", 35, null],
  ["d:cariani.com.br", "Renato Cariani", ["Renato Cariani"], "cariani.com.br", 8, 30, 1, "2026-09-08", ["emagrecer"], "Pessoas comuns que estavam cansadas de tentar emagrecer, perder a barriga e recuperar a autoestima.", 22, 3],
  ["a:receitas sem culpa", "Receitas sem Culpa", ["Receitas sem Culpa", "Receitas Sem Culpa 7.0", "Comer Sem Culpa 1.0", "Comer Sem Culpa 2.0", "Chefe Sandra Regina"], null, 6, 14, 5, "2026-05-30", ["pague depois", "acesso imediato"], "+50 RECEITAS de PÃES para DIABÉTICOS que querem comer BEM! 💰 Receba ANTES, pague DEPOIS.", null, null],
  ["d:manual.com.br", "Manual", ["Manual", "gabriel_pinhel"], "manual.com.br", 5, 12, 2, "2026-10-22", ["queda de cabelo"], "Por que escolher a MANUAL? Praticidade total: tudo online, em poucos minutos, sem sair de casa.", 12, 800],
  ["d:zencial.com.br", "Zencial", ["Zencial"], "zencial.com.br", 4, 5, 1, "2026-05-14", ["colágeno", "queda de cabelo"], "O novo método chegou!! ✨ Testado e Aprovado ✅", 5, 200],
  ["d:universidadebilingue.com.br", "Inglês Fluente", ["Inglês Fluente"], "universidadebilingue.com.br", 6, 15, 1, "2026-09-11", ["acesso imediato"], "DESCONTO DE R$100 PARA VOCÊ COMEÇAR HOJE! Como artistas, empresários e jogadores aprendem inglês.", 9, 8],
  ["d:alwaysfit.com.br", "Always FIT", ["Always FIT"], "alwaysfit.com.br", 4, 8, 1, "2026-08-10", ["queda de cabelo"], "Você está cansado de gastar dinheiro em suplementos baratos que não funcionam?", 8, 500],
  ["d:brmoveis.com.br", "BR Móveis", ["BR Móveis"], "brmoveis.com.br", 11, 11, 1, "2026-05-10", ["pagamento na entrega"], "🚨 PREÇO DE FÁBRICA — PAGAMENTO NA ENTREGA! 🚨 Aqui é DIRETO da fábrica.", 11, 2],
  ["a:loja exemplo", "Loja Exemplo", ["Loja Exemplo"], null, 1, 1, 1, "2026-10-20", ["frete grátis"], "Oferta com um anúncio só, sem sinal de escala.", 1, null],
  ["d:benditacanfora.com.br", "Bendita Cânfora", ["Bendita Cânfora", "Cânfora Casa"], "benditacanfora.com.br", 4, 4, 2, "2026-09-29", ["compre 2 leve 3"], "🌿 Sua casa livre daquela sensação de mofo e umidade começa pelos pequenos cantinhos.", null, 74],
  ["us:d:glowpatch.com", "GlowPatch", ["GlowPatch", "Glow Patch US"], "glowpatch.com", 14, 41, 2, "2026-06-02", ["free shipping", "weight loss"], "The patch everyone is talking about. Buy 2 get 1 free + free shipping today only.", 25, 140],
  ["us:d:pawsafe.co", "PawSafe", ["PawSafe"], "pawsafe.co", 6, 12, 1, "2026-09-18", ["shop now"], "Your dog deserves joint relief. Vet-formulated chews, 30-day money back guarantee.", 12, 9],
  ["gb:d:gymshark.com", "Gymshark", ["Gymshark"], "gymshark.com", 12, 30, 1, "2026-03-01", ["free uk delivery"], "New season drop. Free UK delivery over £50.", 22, 900],
  ["jp:d:kireilab.jp", "キレイラボ", ["キレイラボ"], "kireilab.jp", 9, 18, 1, "2026-04-11", ["初回限定"], "初回限定 980円！送料無料でお届けします。", 15, 30],
].map(([offer_key, advertiser, advertisers, domain, cards, copies, pages, oldest_start, keywords, sample_text, copies_7d, google_ads]) => {
  const c = copies as number, c7 = copies_7d as number | null;
  const growth = c7 === null ? 0 : c - c7;
  const g = (google_ads as number | null) ?? 0;
  const d = domain as string | null;
  const x = EXTRA[offer_key as string] ?? {};
  const k = offer_key as string;
  const country = k.match(/^([a-z]{2}):/)?.[1].toUpperCase() ?? "BR";
  const days = Math.round((Date.now() - Date.parse(oldest_start as string)) / 864e5);
  return {
    country, currency: { BR: "BRL", US: "USD", JP: "JPY" }[country] ?? "BRL", days_running: days,
    ads_active: Math.max(Math.round((cards as number) * 0.8), 1), long_runners: days > 60 ? Math.ceil((cards as number) / 4) : 0,
    new_ads_7d: c7 === null ? (cards as number) : Math.max(growth > 0 ? Math.ceil(growth / 3) : 0, 0), media_count: k === "d:constlivre.com.br" ? 3 : 0,
    cooling: k === "d:cariani.com.br", watched: k === "d:constlivre.com.br" || k === "us:d:glowpatch.com", has_kit: k === "d:constlivre.com.br",
    dest_type: d ? "site" : advertiser === "Receitas sem Culpa" ? "whatsapp" : "mensagem",
    thumb_path: null, platform: null, checkout: null, price_min: null, price_max: null, installments: null, cod: false, has_vsl: false, pixels: [],
    niche: null, kind: null, audience: null, promise: null, mechanism: null, offer: null, risk: null, risk_reason: null,
    status: null, note: null, discarded: false,
    ...x,
    landing_url: d ? `https://${d}/` + (d.includes("constlivre") ? "kit-desafio-90-dias" : "") : advertiser === "Receitas sem Culpa" ? "https://api.whatsapp.com/send?phone=5500000000000" : null,
    page_url: `https://www.facebook.com/${String(advertiser).toLowerCase().replace(/[^a-z0-9]/g, "")}/`,
    thumb_url: null,
    offer_key, advertiser, advertisers, domain, last_day: today, cards, copies, pages, oldest_start, keywords, sample_text,
    cards_7d: c7 === null ? null : Math.max((cards as number) - 3, 1), copies_7d: c7, copies_growth: growth, google_ads,
    first_seen: c7 === null ? daysAgo(2) : daysAgo(30),
    score: c + 2 * (cards as number) + 5 * Math.max((pages as number) - 1, 0) + (g >= 100 ? 10 : g >= 10 ? 5 : 0) + 2 * Math.max(growth, 0),
  };
});

const SNAPSHOTS: Row[] = Array.from({ length: 14 }, (_, i) => ({
  offer_key: "d:constlivre.com.br", day: daysAgo(13 - i), cards: 8 + Math.round(i * 0.9), copies: 12 + Math.round(i * 1.6 + (i > 9 ? (i - 9) * 2 : 0)), pages: i > 6 ? 3 : 2,
}));

const ADS: Row[] = [
  { library_id: "1001", media_path: "ads/1001.mp4", video_url: null, advertiser: "ConstLivre", body: "🚨 O Desafio 90 Dias ConstLivre está com uma oportunidade imperdível: Compre 2 LEVE 3 🔥\nNão deixe para depois.", start_date: "2026-07-20", copies: 13, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
  { library_id: "1002", advertiser: "Juju Salimeni", body: "🚨 A melhor promoção do ConstLivre está no ar!\n✅ Compre 2 caixas e leve 3.", start_date: "2026-08-26", copies: 6, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
  { library_id: "1003", advertiser: "Renato Cariani", body: "Se você já tentou diversas alternativas e ainda não encontrou uma rotina que faça sentido, talvez esteja na hora de testar.", start_date: "2026-09-25", copies: 4, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
];

const KEYWORDS: Row[] = [
  ...["frete grátis", "pagamento na entrega", "acesso imediato", "compre 2 leve 3", "renda extra", "emagrecer", "pague depois", "últimas unidades", "garantia de 30 dias", "comente eu quero", "colágeno", "receitas", "menopausa", "dores", "queda de cabelo"].map((term) => [term, "BR"]),
  ["free shipping", "US"], ["weight loss", "US"], ["shop now", "US"], ["初回限定", "JP"], ["送料無料", "JP"],
].map(([term, country], i) => ({ id: i + 1, term, country, active: i !== 4 }));

const KITS: Row[] = [{
  offer_key: "d:constlivre.com.br", model: "gemini-flash-lite-latest", updated_at: new Date().toISOString(),
  structure: {
    resumo: "Kit de fibras para desinchar vendido como desafio de 90 dias, com kits de 1, 3 e 5 meses e influenciadores como prova.",
    publico: "mulheres 30–50 com barriga inchada", promessa: "Desinchar e perder barriga em 90 dias", mecanismo: "fibras que regulam o intestino", angulo: "desafio + autoridade de influenciador",
    secoes: [
      { tipo: "headline", titulo: "Desafio 90 Dias", resumo: "promessa com prazo e foto de antes/depois suave" },
      { tipo: "vsl", titulo: "Vídeo do Cariani", resumo: "autoridade explica o mecanismo em 4 minutos" },
      { tipo: "beneficios", titulo: "O que muda no seu corpo", resumo: "6 benefícios com ícones" },
      { tipo: "prova social", titulo: "Quem já fez", resumo: "depoimentos em vídeo de clientes" },
      { tipo: "oferta", titulo: "Escolha seu kit", resumo: "3 kits, o do meio destacado como mais vendido" },
      { tipo: "garantia", titulo: "30 dias", resumo: "devolução sem perguntas" },
      { tipo: "faq", titulo: "Dúvidas", resumo: "8 perguntas sobre uso e entrega" },
    ],
    oferta: { kits: [{ nome: "1 mês", preco: "R$ 197" }, { nome: "3 meses (compre 2 leve 3)", preco: "R$ 297" }, { nome: "5 meses", preco: "R$ 497" }], bonus: ["guia de receitas", "grupo VIP"], garantia: "30 dias", frete: "grátis", pagamento: "pix, cartão 12x", escassez: "cupom do dia" },
    provas: ["influenciadores", "depoimentos em vídeo", "número de clientes"], objecoes: ["preço", "demora para ver resultado", "sabor"], ctas: ["QUERO MEU KIT", "COMEÇAR O DESAFIO"],
    funil: "anúncio → página com VSL → checkout Yampi → order bump de coqueteleira", ideias_de_teste: ["ângulo de desafio com amiga", "kit de entrada mais barato", "UGC de rotina matinal", "garantia estendida", "quiz antes da página"],
  },
  my_input: { produto: "Chá detox de hibisco", marca: "Lux Chá", preco: "R$ 97", diferencial: "", publico: "", idioma: "português do Brasil" },
  my_version: "## Página de vendas\n\n### 1. Headline\n**Desafio 30 Dias Lux Chá: menos inchaço, mais disposição**\n…\n\n## 10 ganchos\n1. \"Eu tomava 3 cafés por dia até descobrir isso…\"\n2. …",
  my_model: "gemini-flash-lite-latest", my_updated_at: new Date().toISOString(),
}];

const TRANSCRIPTS: Row[] = [{ library_id: "1001", hook: "\"Pare de cortar o pão\" — mulher na cozinha segurando o pote", structure: "gancho → problema → autoridade → demonstração → oferta compre 2 leve 3 → chamada", cta: "Clique em saiba mais e garanta o kit", transcript: "Pare de cortar o pão. O problema não é o pão…" }];

const TT_TOP: Row[] = [
  ["7689472689073586196", "BR", "Transforme sua rotina com um caldo de ossos feito de verdade. Conheça!", "", "Alimentos e bebidas", "conversões", 1240, 0.67, 29],
  ["7694006725578850325", "BR", "30 brincadeiras sem tela para imprimir e curtir em família. Conheça o kit por R$17,90!", "", "Educação", "conversões", 870, 0.74, 21],
  ["7690988055779901448", "BR", "HM Smart Barra Funda: estrutura concluída, fase de instalações", "HM Engenharia", "Imóveis", "visualizações", 31, 0.84, 34],
  ["7686820729639895061", "US", "Score every point! New grip socks, buy 2 get 1 free.", "GripPro", "Esportes", "tráfego", 5320, 0.93, 18],
].map(([id, country, ad_title, brand_name, industry, objective, likes, ctr, duration], i) => ({
  id, country, ad_title, brand_name, industry, objective, likes, ctr, duration, cover_url: null, video_url: null, thumb_path: null,
  media_path: i === 0 ? "tt/7689472689073586196.mp4" : null, best_rank: i + 1, first_seen: new Date(Date.now() - (i === 1 ? 3600e3 : 5 * 864e5)).toISOString(), last_seen: new Date().toISOString(),
}));

const TT_LIB: Row[] = [
  { id: "1880333310201858", watch_id: 4, country: "GB", advertiser: "GYMSHARK LTD", title: "New season, new PRs #gymshark", first_shown: daysAgo(29), last_shown: daysAgo(1), audience: "1K-10K", cover_url: null, thumb_path: null },
  { id: "1880333310201859", watch_id: 4, country: "GB", advertiser: "GYMSHARK LTD", title: "Legging restock", first_shown: daysAgo(6), last_shown: daysAgo(1), audience: "0-1K", cover_url: null, thumb_path: null },
];

const WATCH: Row[] = [
  { id: 1, offer_key: "d:constlivre.com.br", label: "ConstLivre", term: "constlivre.com.br", country: "BR", created_at: new Date().toISOString() },
  { id: 2, offer_key: "us:d:glowpatch.com", label: "GlowPatch", term: "glowpatch.com", country: "US", created_at: new Date().toISOString() },
  { id: 3, offer_key: null, label: "concorrente.com.br", term: "concorrente.com.br", country: "BR", created_at: new Date().toISOString() },
  { id: 4, offer_key: "gb:d:gymshark.com", label: "Gymshark", term: "gymshark.com", country: "GB", created_at: new Date().toISOString() },
];

const IGNORED: Row[] = ["Shopee", "Mercado Livre", "AliExpress", "InfinitePay", "O Boticário", "Natura", "Amazon.com.br", "SHEIN Brasil"].map((name) => ({ name }));

const RA: Row[] = [
  ["Lunna Cosméticos", "Não Recomendada", 320, "lunna-cosmeticos"], ["DELGADO INTERMEDIAÇÕES", "Ótima", 223, null], ["Drogaria Nacional", "Não Recomendada", 217, null],
  ["Reel Short", "Não Recomendada", 186, "reel-short"], ["PAGO COMERCIO DIGITAL", "Não Recomendada", 170, null], ["D7 SOLUCOES ON-LINE", "Não Recomendada", 166, null],
  ["Coraluz", "Não Recomendada", 150, "coraluz"], ["Drogaria Nova Farma Cotia", "Não Recomendada", 136, null], ["Italihaus", "Não Recomendada", 86, "italihaus"],
].map(([name, reputation, complaints, slug], i) => ({ day: today, position: i + 1, name, reputation, complaints, slug }));

const minsAgo = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
const RUNS: Row[] = [
  { id: 9, source: "alertas", ok: true, items: 2, message: "", finished_at: minsAgo(38) },
  { id: 8, source: "ia", ok: true, items: 24, message: "gemini-flash-latest", finished_at: minsAgo(39) },
  { id: 7, source: "paginas", ok: true, items: 31, message: "", finished_at: minsAgo(41) },
  { id: 6, source: "reclameaqui", ok: true, items: 20, message: "", finished_at: minsAgo(43) },
  { id: 5, source: "google", ok: true, items: 12, message: "", finished_at: minsAgo(45) },
  { id: 4, source: "criativos", ok: true, items: 118, message: "", finished_at: minsAgo(47) },
  { id: 3, source: "meta", ok: true, items: 1240, message: "média 92 anúncios/busca", finished_at: minsAgo(48) },
  { id: 2, source: "meta", ok: false, items: 0, message: "A Meta pediu login para a busca — o IP do robô pode ter sido bloqueado.", finished_at: minsAgo(60 * 9) },
];
const LANDINGS: Row[] = [
  { url: "https://constlivre.com.br/kit-desafio-90-dias", shot_path: "p/demo.webp", currency: "BRL", title: "Desafio 90 Dias ConstLivre", platform: "Shopify", checkout: "Yampi", prices: [197, 297, 497], price_min: 197, price_max: 497, installments: "12x de R$ 41,42", cod: false, has_vsl: true, has_countdown: true, has_whatsapp: true, pixels: ["Meta", "TikTok", "GTM"], error: null, checked_at: minsAgo(41) },
];

const TABLES: Record<string, Row[]> = {
  offer_ranking: OFFERS, offer_snapshots: SNAPSHOTS, ads: ADS, keywords: KEYWORDS,
  ignored_advertisers: IGNORED, ra_new_companies: RA, runs: RUNS,
  landing_pages: LANDINGS, offer_aliases: [], offer_insights: [], alerts_sent: [],
  offer_kits: KITS, ad_transcripts: TRANSCRIPTS, watchlist: WATCH,
  tiktok_top_ads: TT_TOP, tiktok_library_ads: TT_LIB, tiktok_watch_counts: [{ watch_id: 4, day: today, total: 2179 }],
  offer_notes: OFFERS.filter((o) => o.status).map((o) => ({ offer_key: o.offer_key, status: o.status, note: o.note, updated_at: today })),
};

/** Imita o encadeamento do supabase-js o suficiente para as páginas do painel. */
class Query implements PromiseLike<{ data: Row[] | Row | null; error: null; count: number | null }> {
  private rows: Row[];
  private single = false;
  private head = false;
  private counted = false;
  constructor(table: string) { this.rows = [...(TABLES[table] ?? [])]; }
  select(_cols?: string, opts: { count?: string; head?: boolean } = {}) { this.counted = !!opts.count; this.head = !!opts.head; return this; }
  gt(col: string, v: number) { this.rows = this.rows.filter((r) => typeof r[col] === "number" && (r[col] as number) > v); return this; }
  eq(col: string, v: unknown) { this.rows = this.rows.filter((r) => r[col] === v); return this; }
  gte(col: string, v: string) { this.rows = this.rows.filter((r) => String(r[col] ?? "") >= v); return this; }
  not(col: string, op: string, v: unknown) { if (op === "is" && v === null) this.rows = this.rows.filter((r) => r[col] !== null && r[col] !== undefined); return this; }
  // "checkout.eq.Yampi,platform.eq.Yampi"
  private orEq(expr: string) {
    const conds = expr.split(",").map((c) => { const [col, op, ...v] = c.split("."); return [col, op, v.join(".")]; });
    return this.rows.filter((r) => conds.some(([col, op, v]) => op === "eq" && String(r[col]) === v));
  }
  contains(col: string, vals: unknown[]) { this.rows = this.rows.filter((r) => vals.every((v) => (r[col] as unknown[] | undefined)?.includes(v))); return this; }
  or(expr: string): this {
    const nested = expr.match(/^and\(or\((.*)\),or\((.*)\)\)$/);
    if (nested) return this.or(nested[1]).or(nested[2]);
    if (/\.eq\.[^\d]/.test(expr) && !expr.includes("ilike")) { this.rows = this.orEq(expr); return this; }
    if (!expr.includes("ilike")) {
      // condições do tipo "copies.gte.3,pages.gte.2"
      const conds = expr.split(",").map((c) => c.split("."));
      this.rows = this.rows.filter((r) => conds.some(([col, op, v]) => {
        const x = r[col] as number | null; const n = Number(v);
        return typeof x === "number" && (op === "gte" ? x >= n : op === "gt" ? x > n : op === "eq" ? x === n : false);
      }));
      return this;
    }
    const term = (expr.match(/%([^%]+)%/)?.[1] ?? "").toLowerCase();
    this.rows = this.rows.filter((r) => ["advertiser", "domain", "sample_text", "landing_url", "promise"].some((c) => String(r[c] ?? "").toLowerCase().includes(term)));
    return this;
  }
  private ordered = false;
  order(col: string, opts: { ascending?: boolean } = {}) {
    if (this.ordered) return this; // só a primeira ordenação conta (o desempate não muda o exemplo)
    this.ordered = true;
    const asc = opts.ascending ?? true;
    this.rows.sort((a, b) => {
      const x = a[col] as number | string | null, y = b[col] as number | string | null;
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x < y ? -1 : 1) * (asc ? 1 : -1);
    });
    return this;
  }
  private limitN = Infinity;
  limit(n: number) { this.limitN = n; return this; } // aplicado no fim, como no banco
  in(col: string, vals: unknown[]) { this.rows = this.rows.filter((r) => vals.includes(r[col])); return this; }
  is(col: string, v: null) { this.rows = this.rows.filter((r) => r[col] === v || r[col] === undefined); return this; }
  lte(col: string, v: number) { this.rows = this.rows.filter((r) => r[col] !== null && r[col] !== undefined && Number(r[col]) <= v); return this; }
  like() { return this; }
  neq(col: string, v: unknown) { this.rows = this.rows.filter((r) => r[col] !== v); return this; }
  ilike() { return this; }
  delete() { return this; }
  maybeSingle() { this.single = true; return this; }
  upsert() { return this; }
  update() { return this; }
  then<A, B>(ok?: ((v: { data: Row[] | Row | null; error: null; count: number | null }) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    const rows = this.rows.slice(0, this.limitN);
    const data = this.head ? null : this.single ? rows[0] ?? null : rows;
    const count = this.counted ? this.rows.length : null;
    return Promise.resolve({ data, error: null, count }).then(ok, fail);
  }
}

export const demoClient = { from: (table: string) => new Query(table) };
