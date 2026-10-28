import { createHash } from "node:crypto";

/** Nichos fixos: a IA escolhe um destes (facilita filtrar no painel). */
export const NICHES = [
  "Emagrecimento", "Beleza e skincare", "Cabelo", "Saúde e bem-estar", "Fitness", "Moda e acessórios",
  "Casa e decoração", "Cozinha e receitas", "Pets", "Infantil e maternidade", "Educação e concursos",
  "Idiomas", "Profissões e cursos técnicos", "Renda extra e negócios", "Finanças", "Fé e religião",
  "Relacionamento", "Tecnologia e gadgets", "Automotivo", "Serviços locais", "Outros",
] as const;

export const KINDS = ["produto fisico", "infoproduto", "nutra", "servico", "app", "outro"] as const;
export const RISKS = ["baixo", "medio", "alto"] as const;

export interface OfferInput {
  key: string;
  advertiser: string;
  domain: string | null;
  texts: string[];         // textos dos anúncios com mais cópias
  landingTitle?: string | null;
  landingExcerpt?: string | null;
  prices?: number[];
}

export interface Insight {
  key: string;
  nicho: string;
  tipo: string;
  publico: string;
  promessa: string;
  mecanismo: string;
  oferta: string;
  risco: string;
  motivo_risco: string;
}

/** Hash do que vai para a IA: se nada mudou, não gasta cota de novo. */
export function inputHash(o: OfferInput): string {
  return createHash("sha1").update(JSON.stringify([o.advertiser, o.domain, o.texts.slice(0, 3), o.landingTitle ?? "", (o.landingExcerpt ?? "").slice(0, 600)])).digest("hex").slice(0, 16);
}

export function buildPrompt(batch: OfferInput[]): string {
  const items = batch.map((o) => ({
    key: o.key,
    anunciante: o.advertiser,
    site: o.domain,
    anuncios: o.texts.slice(0, 3).map((t) => t.slice(0, 500)),
    pagina_titulo: o.landingTitle ?? null,
    pagina_texto: o.landingExcerpt ? o.landingExcerpt.slice(0, 900) : null,
    precos: o.prices?.slice(0, 6) ?? [],
  }));
  return [
    "Você analisa ofertas anunciadas no Facebook/Instagram no Brasil para um gestor de tráfego que estuda o mercado.",
    "Para cada item, responda em português do Brasil, curto e objetivo, usando só o que está nos textos (não invente):",
    `- nicho: um destes: ${NICHES.join(" | ")}`,
    `- tipo: um destes: ${KINDS.join(" | ")} (nutra = suplemento/cápsula/chá/produto de saúde de consumo)`,
    "- publico: para quem é (até 8 palavras)",
    "- promessa: o resultado prometido (até 15 palavras)",
    "- mecanismo: como diz que entrega o resultado (até 15 palavras; vazio se não houver)",
    "- oferta: preço, kits, bônus, garantia, frete (até 20 palavras; vazio se não houver)",
    `- risco: ${RISKS.join(" | ")} = chance de reprovação nas políticas de anúncio (promessa de cura, antes/depois, renda garantida, perda de peso rápida = alto)`,
    "- motivo_risco: até 12 palavras",
    "Devolva um item para cada key recebida, com a mesma key.",
    "",
    JSON.stringify(items),
  ].join("\n");
}

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      key: { type: "STRING" },
      nicho: { type: "STRING", enum: [...NICHES] },
      tipo: { type: "STRING", enum: [...KINDS] },
      publico: { type: "STRING" },
      promessa: { type: "STRING" },
      mecanismo: { type: "STRING" },
      oferta: { type: "STRING" },
      risco: { type: "STRING", enum: [...RISKS] },
      motivo_risco: { type: "STRING" },
    },
    required: ["key", "nicho", "tipo", "publico", "promessa", "mecanismo", "oferta", "risco", "motivo_risco"],
  },
};

/** Lê a resposta do Gemini e descarta itens fora do formato. */
export function parseInsights(raw: string, keys: string[]): Insight[] {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const valid = new Set(keys);
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return data
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && valid.has(String((d as Record<string, unknown>).key)))
    .map((d) => ({
      key: String(d.key),
      nicho: (NICHES as readonly string[]).includes(String(d.nicho)) ? String(d.nicho) : "Outros",
      tipo: (KINDS as readonly string[]).includes(String(d.tipo)) ? String(d.tipo) : "outro",
      publico: clip(d.publico, 120),
      promessa: clip(d.promessa, 200),
      mecanismo: clip(d.mecanismo, 200),
      oferta: clip(d.oferta, 240),
      risco: (RISKS as readonly string[]).includes(String(d.risco)) ? String(d.risco) : "medio",
      motivo_risco: clip(d.motivo_risco, 160),
    }));
}

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Chama o Gemini (cota gratuita do Google AI Studio) pedindo JSON no formato `schema`.
 * Tenta os modelos em ordem até um responder. Em limite de uso (429/503) espera e tenta de novo;
 * se demorar demais, tenta mais uma vez e passa para o próximo modelo.
 */
export async function geminiJson(opts: {
  apiKey: string;
  models: string[];
  parts: GeminiPart[];
  schema: object;
  doFetch?: Fetch;
  timeoutMs?: number;
  temperature?: number;
}): Promise<{ text: string; model: string }> {
  const { apiKey, models, parts, schema, doFetch = fetch, timeoutMs = 90_000, temperature = 0.2 } = opts;
  // pouco "raciocínio": as tarefas são simples e o modo de pensar deixa a resposta lenta demais.
  // Cada geração de modelo aceita uma opção diferente; se uma der erro 400, tenta a próxima.
  const THINKING: (object | null)[] = [{ thinkingLevel: "low" }, { thinkingBudget: 0 }, null];
  const makeBody = (variant: number) =>
    JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(THINKING[variant] ? { thinkingConfig: THINKING[variant] } : {}),
      },
    });
  const errs: string[] = [];
  let lastErr = "";
  for (const model of models) {
    let variant = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const body = makeBody(variant);
      let res: Response;
      try {
        res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        lastErr = `${model}: ${(e as Error).name === "TimeoutError" ? "demorou demais" : (e as Error).message}`;
        if (attempt >= 1) break;
        continue;
      }
      if (res.status === 429 || res.status === 503) {
        lastErr = `${model}: ${res.status}`;
        await sleep(20_000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) {
        lastErr = `${model}: modelo não encontrado`;
        break; // tenta o próximo modelo
      }
      if (res.status === 400 && variant < THINKING.length - 1) {
        lastErr = `${model}: HTTP 400 ${(await res.text()).replace(/\s+/g, " ").slice(0, 120)}`;
        variant++; // modelo não aceita essa opção de raciocínio: tenta a próxima
        attempt--;
        continue;
      }
      if (!res.ok) {
        lastErr = `${model}: HTTP ${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 160)}`;
        break;
      }
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return { text, model };
    }
    if (lastErr) errs.push(lastErr);
    lastErr = "";
  }
  throw new Error(`Gemini indisponível (${[...errs, lastErr].filter(Boolean).join("; ")})`);
}

/** Classifica um lote de ofertas (nicho, tipo, promessa, risco...). */
export async function classifyBatch(
  batch: OfferInput[],
  apiKey: string,
  models: string[],
  doFetch: Fetch = fetch,
  timeoutMs = 90_000,
): Promise<{ insights: Insight[]; model: string }> {
  const r = await geminiJson({ apiKey, models, parts: [{ text: buildPrompt(batch) }], schema: SCHEMA, doFetch, timeoutMs });
  return { insights: parseInsights(r.text, batch.map((b) => b.key)), model: r.model };
}

/** Lê JSON vindo da IA (às vezes com cerca de código em volta). */
export function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as T;
  } catch {
    return null;
  }
}

/* ---------------- Transcrição dos vídeos ---------------- */

export interface Transcript {
  transcricao: string;
  gancho: string;
  estrutura: string;
  cta: string;
}

const TRANSCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcricao: { type: "STRING" },
    gancho: { type: "STRING" },
    estrutura: { type: "STRING" },
    cta: { type: "STRING" },
  },
  required: ["transcricao", "gancho", "estrutura", "cta"],
};

export const TRANSCRIBE_PROMPT = [
  "Este é um vídeo de anúncio. Responda em português do Brasil (a transcrição fica no idioma original do vídeo).",
  "- transcricao: tudo o que é falado, palavra por palavra; inclua entre colchetes textos importantes que aparecem na tela.",
  "- gancho: o que acontece e o que é dito nos primeiros 3 segundos (até 25 palavras).",
  "- estrutura: as etapas do vídeo em ordem, separadas por ' → ' (ex.: gancho → problema → demonstração → prova → oferta → chamada).",
  "- cta: a chamada para ação do final (até 15 palavras).",
  "Se não houver fala, descreva as cenas em 'transcricao'.",
].join("\n");

/** Transcreve um vídeo (até ~18 MB, enviado junto no pedido) e separa gancho, estrutura e chamada. */
export async function transcribeVideo(video: Buffer, apiKey: string, models: string[], doFetch: Fetch = fetch) {
  const r = await geminiJson({
    apiKey, models, doFetch, timeoutMs: 150_000, schema: TRANSCRIPT_SCHEMA,
    parts: [{ inlineData: { mimeType: "video/mp4", data: video.toString("base64") } }, { text: TRANSCRIBE_PROMPT }],
  });
  const t = parseJson<Transcript>(r.text);
  if (!t || typeof t.transcricao !== "string") throw new Error("resposta da IA fora do formato");
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    transcript: { transcricao: clip(t.transcricao, 8000), gancho: clip(t.gancho, 400), estrutura: clip(t.estrutura, 600), cta: clip(t.cta, 300) },
    model: r.model,
  };
}

/* ---------------- Kit de modelagem: mapa da página e do funil ---------------- */

export interface KitInput {
  key: string;
  advertiser: string;
  domain: string | null;
  url: string;
  pageText: string;
  prices: number[];
  currency: string | null;
  checkout: string | null;
  platform: string | null;
  adTexts: string[];
}

export interface KitStructure {
  resumo: string;
  publico: string;
  promessa: string;
  mecanismo: string;
  angulo: string;
  secoes: { tipo: string; titulo: string; resumo: string }[];
  oferta: { kits: { nome: string; preco: string }[]; bonus: string[]; garantia: string; frete: string; pagamento: string; escassez: string };
  provas: string[];
  objecoes: string[];
  ctas: string[];
  funil: string;
  ideias_de_teste: string[];
}

const S = { type: "STRING" };
const SA = { type: "ARRAY", items: S };
const KIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    resumo: S, publico: S, promessa: S, mecanismo: S, angulo: S,
    secoes: { type: "ARRAY", items: { type: "OBJECT", properties: { tipo: S, titulo: S, resumo: S }, required: ["tipo", "titulo", "resumo"] } },
    oferta: {
      type: "OBJECT",
      properties: {
        kits: { type: "ARRAY", items: { type: "OBJECT", properties: { nome: S, preco: S }, required: ["nome", "preco"] } },
        bonus: SA, garantia: S, frete: S, pagamento: S, escassez: S,
      },
      required: ["kits", "bonus", "garantia", "frete", "pagamento", "escassez"],
    },
    provas: SA, objecoes: SA, ctas: SA, funil: S, ideias_de_teste: SA,
  },
  required: ["resumo", "publico", "promessa", "mecanismo", "angulo", "secoes", "oferta", "provas", "objecoes", "ctas", "funil", "ideias_de_teste"],
};

export function kitHash(k: KitInput): string {
  return createHash("sha1").update(JSON.stringify([k.url, k.pageText.slice(0, 20000), k.prices, k.adTexts.slice(0, 3)])).digest("hex").slice(0, 16);
}

export function buildKitPrompt(k: KitInput): string {
  return [
    "Você é um estrategista de resposta direta. Analise a página de vendas abaixo (texto extraído, em ordem) e os anúncios que levam a ela.",
    "Monte o MAPA DA ESTRUTURA para um gestor de tráfego entender e testar uma oferta parecida com o PRÓPRIO produto dele.",
    "Regras: responda em português do Brasil; resuma com as suas palavras, NÃO copie parágrafos da página; seja concreto (números, prazos, preços).",
    "- resumo: o que é vendido e como, em 2 frases",
    "- publico, promessa, mecanismo (por que funciona, segundo a página), angulo (a abordagem principal: medo, desejo, novidade, autoridade...)",
    "- secoes: cada bloco da página em ordem (tipo: headline | subheadline | vsl | beneficios | prova social | autoridade | como funciona | oferta | bonus | garantia | faq | escassez | cta | outro), com um título curto e um resumo de até 20 palavras",
    "- oferta: kits/planos com preço como aparece, bônus, garantia, frete, formas de pagamento, escassez/urgência (vazio se não houver)",
    "- provas: tipos de prova usados (depoimentos, antes/depois, números, mídia...)",
    "- objecoes: objeções que a página quebra",
    "- ctas: textos dos botões",
    "- funil: o caminho do clique até a compra (página → checkout X → upsell/order bump, se der para perceber)",
    "- ideias_de_teste: 5 ideias práticas para testar uma versão própria (ângulo, criativo, oferta)",
    "",
    `Anunciante: ${k.advertiser}${k.domain ? ` (${k.domain})` : ""}`,
    `Página: ${k.url}`,
    `Feita em: ${k.platform ?? "?"} · checkout: ${k.checkout ?? "?"} · preços encontrados: ${k.prices.length ? k.prices.join(", ") + (k.currency ? ` ${k.currency}` : "") : "nenhum"}`,
    "",
    "ANÚNCIOS:",
    ...k.adTexts.slice(0, 3).map((t, i) => `${i + 1}. ${t.slice(0, 600)}`),
    "",
    "TEXTO DA PÁGINA:",
    k.pageText.slice(0, 20000),
  ].join("\n");
}

export async function buildKit(k: KitInput, apiKey: string, models: string[], doFetch: Fetch = fetch) {
  const r = await geminiJson({ apiKey, models, doFetch, timeoutMs: 120_000, schema: KIT_SCHEMA, parts: [{ text: buildKitPrompt(k) }] });
  const kit = parseJson<KitStructure>(r.text);
  if (!kit || !Array.isArray(kit.secoes)) throw new Error("resposta da IA fora do formato");
  return { kit, model: r.model };
}

const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];

/** Ordem de preferência: os "lite" (rápidos, cota grátis maior), depois os flash normais; estáveis antes de preview. */
export function rankModels(names: string[]): string[] {
  const usable = names
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embed|vision|thinking|exp)/.test(n));
  const score = (n: string) =>
    (/lite/.test(n) ? 0 : 10) + (/-latest$/.test(n) ? 0 : 1) + (/preview/.test(n) ? 5 : 0) - (Number(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0) / 100);
  return [...new Set(usable)].sort((a, b) => score(a) - score(b));
}

/** Pergunta ao Google quais modelos existem hoje (os nomes mudam a cada geração). */
export async function geminiModels(apiKey?: string, doFetch: Fetch = fetch): Promise<string[]> {
  const env = (process.env.GEMINI_MODEL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let found: string[] = [];
  if (apiKey) {
    try {
      const res = await doFetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
        found = rankModels((j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name));
      }
    } catch {
      /* usa a lista padrão */
    }
  }
  return [...new Set([...env, ...found.slice(0, 4), ...FALLBACK_MODELS])];
}
