import { mkdir, writeFile } from "node:fs/promises";
import { classifyBatch, geminiModels, inputHash } from "./ai.js";
import { computeAlerts, formatAlerts, formatWelcome } from "./alerts.js";
import { buildSnapshots, mergeAds, resolveOfferKeys } from "./aggregate.js";
import { storeCreatives } from "./creatives.js";
import * as db from "./db.js";
import { closeBrowser, jitter } from "./sources/browser.js";
import { GoogleTransparencySource } from "./sources/googleBrowser.js";
import { inspectLandings } from "./sources/landingBrowser.js";
import { MetaBrowserSource } from "./sources/metaBrowser.js";
import { fetchRaNewCompanies } from "./sources/reclameAquiBrowser.js";
import { esc, panelUrl, sendTelegram, telegramConfigured } from "./telegram.js";
import type { KeywordResult, MetaAdSource } from "./types.js";

type Db = NonNullable<ReturnType<typeof db.getDb>>;

// Usado só quando o banco não está configurado (teste local)
const FALLBACK_KEYWORDS = ["pagamento na entrega", "compre 2 leve 3", "acesso imediato"];

/** Linhas de resumo publicadas como anotação no GitHub Actions. */
const notes: string[] = [];

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const want = (s: string) => only.length === 0 || only.includes(s);
const num = (name: string, def: number) => Number(process.env[name] || def);

/**
 * Troque aqui pela fonte paga quando quiser (ex.: new ApifyMetaSource()).
 * Qualquer classe que implemente MetaAdSource funciona.
 */
function makeMetaSource(): MetaAdSource {
  return new MetaBrowserSource({ scrolls: num("META_SCROLLS", 25), maxCards: num("META_MAX_CARDS", 150) });
}

async function runMeta(client: ReturnType<typeof db.getDb>, day: string) {
  const keywords = client ? await db.loadKeywords(client) : FALLBACK_KEYWORDS;
  if (!keywords.length) {
    throw new Error("Nenhuma palavra-chave ativa no banco (ou a chave do Supabase não tem permissão para ler).");
  }
  const ignored = client ? await db.loadIgnored(client) : new Set<string>();
  const source = makeMetaSource();
  const results: KeywordResult[] = [];
  const errors: string[] = [];
  const perKeyword: number[] = [];
  let loginWalls = 0;

  try {
    for (const term of keywords) {
      try {
        const r = await source.searchKeyword(term);
        console.log(`[meta] "${term}": ${r.ads.length} anúncios (${r.totalResults ?? "?"})`);
        perKeyword.push(r.ads.length);
        if (r.ads.length) results.push(r);
        else errors.push(`"${term}": nenhum anúncio lido`);
      } catch (e) {
        const msg = (e as Error).message;
        if (/pediu login/.test(msg)) loginWalls++;
        errors.push(`"${term}": ${msg}`);
        console.warn(`[meta] falhou "${term}":`, msg);
      }
      await jitter(3000, 7000);
    }
  } finally {
    await source.close();
  }

  const ads = mergeAds(results, ignored);
  const aliases = resolveOfferKeys(ads, client ? await db.loadAliasHints(client) : new Map());
  const snaps = buildSnapshots(ads);
  const avg = perKeyword.length ? Math.round(perKeyword.reduce((a, b) => a + b, 0) / perKeyword.length) : 0;
  console.log(`[meta] ${ads.length} anúncios únicos, ${snaps.length} ofertas, ${aliases.length} duplicadas juntadas`);
  notes.push(
    `Meta: ${results.length}/${keywords.length} buscas ok, média de ${avg} anúncios por busca, ${ads.length} anúncios únicos, ${snaps.length} ofertas, ${aliases.length} duplicadas juntadas` +
      (errors.length ? `. Falhas: ${errors.slice(0, 5).join(" | ")}` : ""),
  );

  // Se a maior parte das buscas falhou, não sobrescreve a foto do dia com dados incompletos
  const healthy = results.length >= Math.ceil(keywords.length / 2);

  if (client) {
    await db.saveAds(client, ads);
    await db.saveAliases(client, aliases);
    if (healthy) await db.saveSnapshots(client, day, snaps);
    await db.logRun(client, "meta", healthy, ads.length, [`média ${avg} anúncios/busca`, ...errors].join("\n"));
  } else {
    await mkdir("out", { recursive: true });
    await writeFile(`out/meta-${day}.json`, JSON.stringify({ results, snaps, aliases }, null, 2));
    console.table(snaps.slice(0, 20).map((s) => ({ oferta: s.advertiser, dominio: s.domain, destino: s.destType, cards: s.cards, copias: s.copies, paginas: s.pages })));
  }
  if (loginWalls >= Math.ceil(keywords.length / 2)) {
    throw new Error(`A Meta pediu login em ${loginWalls} de ${keywords.length} buscas: o IP do GitHub pode estar bloqueado.`);
  }
  if (!healthy) throw new Error(`Coleta da Meta incompleta: ${errors.length} buscas falharam.\n${errors.join("\n")}`);
}

async function runGoogle(client: Db, day: string) {
  const domains = await db.domainsNeedingGoogle(client, day, num("GOOGLE_LIMIT", 40));
  if (!domains.length) return;
  const source = new GoogleTransparencySource();
  let n = 0;
  try {
    for (const d of domains) {
      try {
        const count = await source.countAdsForDomain(d);
        console.log(`[google] ${d}: ${count ?? "não lido"}`);
        if (count !== null) {
          await db.saveGoogleCount(client, day, d, count);
          n++;
        }
      } catch (e) {
        console.warn(`[google] falhou ${d}:`, (e as Error).message);
      }
      await jitter(1500, 3500);
    }
  } finally {
    await source.close();
  }
  await db.logRun(client, "google", true, n);
  notes.push(`Google: ${n}/${domains.length} domínios contados`);
}

async function runRa(client: ReturnType<typeof db.getDb>, day: string) {
  if (client && (await db.raAlreadyToday(client, day))) {
    console.log("[ra] já coletado hoje");
    return;
  }
  const rows = await fetchRaNewCompanies();
  console.log(`[ra] ${rows.length} empresas`);
  notes.push(`Reclame Aqui: ${rows.length} empresas`);
  if (client) {
    await db.saveRa(client, day, rows);
    await db.logRun(client, "reclameaqui", rows.length > 0, rows.length);
  } else {
    console.table(rows);
  }
}

/** Raio-X das páginas de vendas: cada página é visitada uma vez por semana. */
async function runLandings(client: Db) {
  const urls = await db.landingsToCheck(client, num("LANDING_LIMIT", 40));
  if (!urls.length) return;
  const rows = await inspectLandings(urls);
  await db.saveLandings(client, rows);
  const ok = rows.filter((r) => !r.error).length;
  await db.logRun(client, "paginas", true, ok, rows.filter((r) => r.error).slice(0, 5).map((r) => `${r.url}: ${r.error}`).join("\n"));
  notes.push(`Páginas de vendas: ${ok}/${rows.length} analisadas`);
}

/** Classificação com o Gemini (cota grátis): só ofertas novas ou que mudaram. */
async function runAi(client: Db) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    notes.push("IA: pulada (GEMINI_API_KEY não configurada)");
    return;
  }
  const size = num("AI_BATCH", 8);
  const todo = await db.offersForAi(client, size * num("AI_BATCHES", 6), inputHash);
  let done = 0;
  let model = "";
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    const r = await classifyBatch(batch, key, geminiModels());
    model = r.model;
    const byKey = new Map(batch.map((b) => [b.key, b.hash]));
    await db.saveInsights(client, r.insights.map((x) => ({ ...x, hash: byKey.get(x.key)!, model: r.model })));
    done += r.insights.length;
    if (i + size < todo.length) await new Promise((res) => setTimeout(res, 7000)); // respeita o limite por minuto
  }
  await db.logRun(client, "ia", true, done, model);
  notes.push(`IA: ${done}/${todo.length} ofertas classificadas${model ? ` (${model})` : ""}`);
}

/** Guarda as imagens dos criativos antes que o link do Facebook expire. */
async function runCreatives(client: Db) {
  const keys = await db.signalKeys(client);
  const items = await db.creativesToStore(client, keys, num("CREATIVES_LIMIT", 200));
  if (!items.length) return;
  const r = await storeCreatives(client, items);
  await db.logRun(client, "criativos", r.failed < items.length, r.saved, r.failed ? `${r.failed} falharam` : "");
  notes.push(`Criativos: ${r.saved} imagens guardadas${r.failed ? `, ${r.failed} falharam` : ""}`);
}

/** Avisos no Telegram: oferta nova no top 20 e disparo de cópias. */
async function runAlerts(client: Db) {
  if (!telegramConfigured()) {
    notes.push("Alertas: pulados (Telegram não configurado)");
    return;
  }
  const rows = await db.rankingForAlerts(client);
  const sent = await db.loadSentAlerts(client);
  const { firstRun, toSend, toMark, top } = computeAlerts(rows, sent);
  if (firstRun) await sendTelegram(formatWelcome(top));
  else if (toSend.length) await sendTelegram(formatAlerts(toSend));
  await db.markAlerts(client, toMark);
  notes.push(`Alertas: ${firstRun ? "primeira mensagem enviada" : `${toSend.length} enviados`}`);
}

async function main() {
  const client = db.getDb();
  const day = db.todaySP();
  if (!client) console.log("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não definidos: modo teste, resultados em ./out");

  const failures: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message}`);
      console.error(`[${name}]`, e);
      await db.logRun(client, name, false, 0, (e as Error).message).catch(() => {});
    }
  };

  if (want("meta")) await step("meta", () => runMeta(client, day));
  if (client) {
    // criativos logo depois da Meta, enquanto os links das imagens ainda valem
    if (want("criativos")) await step("criativos", () => runCreatives(client));
    if (want("google")) await step("google", () => runGoogle(client, day));
    if (want("ra")) await step("reclameaqui", () => runRa(client, day));
    if (want("paginas")) await step("paginas", () => runLandings(client));
    if (want("ia")) await step("ia", () => runAi(client));
    if (want("alertas")) await step("alertas", () => runAlerts(client));
  }

  await closeBrowser();

  // Anotações do GitHub Actions: aparecem no resumo da execução e podem ser lidas pela API
  if (process.env.GITHUB_ACTIONS) {
    const escA = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
    for (const n of notes) console.log(`::notice title=Resumo::${escA(n)}`);
    for (const f of failures) console.log(`::error title=Falha::${escA(f.slice(0, 1500))}`);
  }

  if (failures.length) {
    console.error("\nFalhas:\n" + failures.join("\n"));
    const run = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
      ? `\n\n<a href="https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}">ver execução</a> · <a href="${panelUrl()}/status">status</a>`
      : "";
    await sendTelegram(`⚠️ <b>Radar: coleta com falha</b>\n\n${failures.map((f) => "• " + esc(f.split("\n")[0].slice(0, 300))).join("\n")}${run}`).catch(() => {});
    process.exit(1);
  }
}

main();
