/**
 * Modo demonstração (RADAR_DEMO=1): dados de exemplo no lugar do Supabase,
 * para ver o painel localmente ou mostrar a alguém sem expor o banco.
 * Os exemplos vêm da pesquisa manual de 26/10/2026.
 */
type Row = Record<string, unknown>;

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

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
].map(([offer_key, advertiser, advertisers, domain, cards, copies, pages, oldest_start, keywords, sample_text, copies_7d, google_ads]) => {
  const c = copies as number, c7 = copies_7d as number | null;
  const growth = c7 === null ? 0 : c - c7;
  const g = (google_ads as number | null) ?? 0;
  const d = domain as string | null;
  return {
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
  { library_id: "1001", advertiser: "ConstLivre", body: "🚨 O Desafio 90 Dias ConstLivre está com uma oportunidade imperdível: Compre 2 LEVE 3 🔥\nNão deixe para depois.", start_date: "2026-07-20", copies: 13, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
  { library_id: "1002", advertiser: "Juju Salimeni", body: "🚨 A melhor promoção do ConstLivre está no ar!\n✅ Compre 2 caixas e leve 3.", start_date: "2026-08-26", copies: 6, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
  { library_id: "1003", advertiser: "Renato Cariani", body: "Se você já tentou diversas alternativas e ainda não encontrou uma rotina que faça sentido, talvez esteja na hora de testar.", start_date: "2026-09-25", copies: 4, last_seen: today, domain: "constlivre.com.br", offer_key: "d:constlivre.com.br", landing_url: "https://constlivre.com.br/", page_url: null, thumb_url: null, media_type: "image" },
];

const KEYWORDS: Row[] = ["frete grátis", "pagamento na entrega", "acesso imediato", "compre 2 leve 3", "renda extra", "emagrecer", "pague depois", "últimas unidades", "garantia de 30 dias", "comente eu quero", "colágeno", "receitas", "menopausa", "dores", "queda de cabelo"]
  .map((term, i) => ({ id: i + 1, term, active: i !== 4 }));

const IGNORED: Row[] = ["Shopee", "Mercado Livre", "AliExpress", "InfinitePay", "O Boticário", "Natura", "Amazon.com.br", "SHEIN Brasil"].map((name) => ({ name }));

const RA: Row[] = [
  ["Lunna Cosméticos", "Não Recomendada", 320, "lunna-cosmeticos"], ["DELGADO INTERMEDIAÇÕES", "Ótima", 223, null], ["Drogaria Nacional", "Não Recomendada", 217, null],
  ["Reel Short", "Não Recomendada", 186, "reel-short"], ["PAGO COMERCIO DIGITAL", "Não Recomendada", 170, null], ["D7 SOLUCOES ON-LINE", "Não Recomendada", 166, null],
  ["Coraluz", "Não Recomendada", 150, "coraluz"], ["Drogaria Nova Farma Cotia", "Não Recomendada", 136, null], ["Italihaus", "Não Recomendada", 86, "italihaus"],
].map(([name, reputation, complaints, slug], i) => ({ day: today, position: i + 1, name, reputation, complaints, slug }));

const RUNS: Row[] = [{ id: 1, source: "meta", ok: true, items: 336, finished_at: new Date(Date.now() - 42 * 60e3).toISOString() }];

const TABLES: Record<string, Row[]> = {
  offer_ranking: OFFERS, offer_snapshots: SNAPSHOTS, ads: ADS, keywords: KEYWORDS,
  ignored_advertisers: IGNORED, ra_new_companies: RA, runs: RUNS,
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
  contains(col: string, vals: unknown[]) { this.rows = this.rows.filter((r) => vals.every((v) => (r[col] as unknown[] | undefined)?.includes(v))); return this; }
  or(expr: string): this {
    const nested = expr.match(/^and\(or\((.*)\),or\((.*)\)\)$/);
    if (nested) return this.or(nested[1]).or(nested[2]);
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
    this.rows = this.rows.filter((r) => ["advertiser", "domain", "sample_text", "landing_url"].some((c) => String(r[c] ?? "").toLowerCase().includes(term)));
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
