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

/**
 * Chama o Gemini (cota gratuita do Google AI Studio). Tenta os modelos em ordem até um responder.
 * Em limite de uso (429) espera e tenta de novo.
 */
export async function classifyBatch(
  batch: OfferInput[],
  apiKey: string,
  models: string[],
  doFetch: Fetch = fetch,
  timeoutMs = 120_000,
): Promise<{ insights: Insight[]; model: string }> {
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: buildPrompt(batch) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  let lastErr = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        // demorou demais ou caiu a conexão: tenta de novo e, na segunda vez, passa para o próximo modelo
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
      if (!res.ok) throw new Error(`Gemini ${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return { insights: parseInsights(text, batch.map((b) => b.key)), model };
    }
  }
  throw new Error(`Gemini indisponível (${lastErr})`);
}

export function geminiModels(): string[] {
  const env = (process.env.GEMINI_MODEL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...env, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"])];
}
