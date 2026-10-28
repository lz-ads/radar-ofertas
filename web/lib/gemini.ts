import "server-only";

/**
 * Gemini (cota grátis do Google AI Studio) no servidor do painel.
 * Mesma lógica do robô: descobre os modelos disponíveis e prefere os "lite" (rápidos).
 */
const FALLBACK = ["gemini-flash-lite-latest", "gemini-flash-latest"];
let cached: { at: number; models: string[] } | null = null;

export function rankModels(names: string[]): string[] {
  const usable = names
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embed|vision|thinking|exp)/.test(n));
  const score = (n: string) =>
    (/lite/.test(n) ? 0 : 10) + (/-latest$/.test(n) ? 0 : 1) + (/preview/.test(n) ? 5 : 0) - Number(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0) / 100;
  return [...new Set(usable)].sort((a, b) => score(a) - score(b));
}

async function models(apiKey: string): Promise<string[]> {
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.models;
  const env = (process.env.GEMINI_MODEL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let found: string[] = [];
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      found = rankModels((j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name));
    }
  } catch {
    /* usa a lista padrão */
  }
  const list = [...new Set([...env, ...found.slice(0, 3), ...FALLBACK])];
  cached = { at: Date.now(), models: list };
  return list;
}

/** Gera texto livre (markdown). Devolve o texto e o modelo que respondeu. */
export async function geminiText(prompt: string, timeoutMs = 50_000): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY nas variáveis da Vercel para usar a IA no painel.");
  const THINKING: (object | null)[] = [{ thinkingLevel: "low" }, { thinkingBudget: 0 }, null];
  const errs: string[] = [];
  const started = Date.now();
  for (const model of await models(apiKey)) {
    for (let variant = 0; variant < THINKING.length; variant++) {
      const left = timeoutMs - (Date.now() - started);
      if (left < 5_000) throw new Error(`A IA demorou demais (${errs.join("; ") || "sem resposta"})`);
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, ...(THINKING[variant] ? { thinkingConfig: THINKING[variant] } : {}) },
          }),
          signal: AbortSignal.timeout(left),
          cache: "no-store",
        });
      } catch (e) {
        errs.push(`${model}: ${(e as Error).name === "TimeoutError" ? "demorou demais" : (e as Error).message}`);
        break;
      }
      if (res.status === 400) continue; // opção de raciocínio não aceita: tenta a próxima
      if (!res.ok) {
        errs.push(`${model}: HTTP ${res.status}`);
        break;
      }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (text) return { text, model };
      errs.push(`${model}: resposta vazia`);
      break;
    }
  }
  throw new Error(`IA indisponível agora (${errs.join("; ")})`);
}
