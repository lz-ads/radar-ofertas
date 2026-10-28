import { mkdir, writeFile } from "node:fs/promises";
import { buildKit, classifyBatch, geminiModels, inputHash, kitHash, transcribeVideo } from "./ai.js";
import { computeAlerts, formatAlerts, formatCooling, formatWatch, formatWelcome } from "./alerts.js";
import { applyCountry, buildSnapshots, mergeAds, resolveOfferKeys, type AdWithMeta, type OfferAlias } from "./aggregate.js";
import { storeCreatives } from "./creatives.js";
import { MEDIA_BUCKET, pruneMedia, storeMedia } from "./media.js";
import * as db from "./db.js";
import { closeBrowser, jitter } from "./sources/browser.js";
import { GoogleTransparencySource } from "./sources/googleBrowser.js";
import { inspectLandings } from "./sources/landingBrowser.js";
import { MetaBrowserSource } from "./sources/metaBrowser.js";
import { fetchRaNewCompanies } from "./sources/reclameAquiBrowser.js";
import { esc, panelUrl, sendTelegram, telegramConfigured } from "./telegram.js";
import type { KeywordResult, MetaAdSource, OfferSnapshot } from "./types.js";

type Db = NonNullable<ReturnType<typeof db.getDb>>;

// Usado só quando o banco não está configurado (teste local)
const FALLBACK_KEYWORDS: db.SearchTerm[] = ["pagamento na entrega", "compre 2 leve 3", "acesso imediato"].map((term) => ({ term, country: "BR" }));

/** Linhas de resumo publicadas como anotação no GitHub Actions. */
const notes: string[] = [];

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const want = (s: string) => only.length === 0 || only.includes(s);
const num = (name: string, def: number) => Number(process.env[name] || def);

/**
 * Troque aqui pela fonte paga quando quiser (ex.: new ApifyMetaSource()).
 * Qualquer classe que implemente MetaAdSource funciona.
 */
function makeMetaSource(country: string): MetaAdSource {
  return new MetaBrowserSource({ scrolls: num("META_SCROLLS", 25), maxCards: num("META_MAX_CARDS", 150), country });
}

/** Países a coletar (vazio = todos os que têm palavra-chave ativa). Ex.: META_COUNTRIES=BR,US */
const onlyCountries = (process.env.META_COUNTRIES || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

async function runMeta(client: ReturnType<typeof db.getDb>, day: string) {
  const keywords = client ? await db.loadKeywords(client) : FALLBACK_KEYWORDS;
  if (!keywords.length) {
    throw new Error("Nenhuma palavra-chave ativa no banco (ou a chave do Supabase não tem permissão para ler).");
  }
  const watch = client ? await db.loadWatch(client) : [];
  const ignored = client ? await db.loadIgnored(client) : new Set<string>();

  // termos por país: palavras-chave + lista de espionagem (sem repetir)
  const byCountry = new Map<string, Set<string>>();
  for (const k of [...keywords, ...watch]) {
    if (onlyCountries.length && !onlyCountries.includes(k.country)) continue;
    const set = byCountry.get(k.country) ?? new Set<string>();
    set.add(k.term);
    byCountry.set(k.country, set);
  }
  const countries = [...byCountry.keys()].sort((a, b) => (a === "BR" ? -1 : b === "BR" ? 1 : a.localeCompare(b)));
  const totalSearches = [...byCountry.values()].reduce((s, t) => s + t.size, 0);

  const errors: string[] = [];
  const perKeyword: number[] = [];
  let okSearches = 0;
  let loginWalls = 0;
  const allAds: (AdWithMeta & { country: string })[] = [];
  const allSnaps: (OfferSnapshot & { country: string })[] = [];
  const allAliases: OfferAlias[] = [];
  const perCountry: string[] = [];

  for (const country of countries) {
    const terms = [...byCountry.get(country)!];
    const source = makeMetaSource(country);
    const results: KeywordResult[] = [];
    try {
      for (const term of terms) {
        try {
          const r = await source.searchKeyword(term);
          console.log(`[meta ${country}] "${term}": ${r.ads.length} anúncios (${r.totalResults ?? "?"})`);
          perKeyword.push(r.ads.length);
          if (r.scroll && perKeyword.length <= 2)
            notes.push(`Meta rolagem "${term}": ${r.scroll.start} → ${r.scroll.end} cards em ${r.scroll.rounds} rolagens.`);
          if (r.ads.length) {
            results.push(r);
            okSearches++;
          } else errors.push(`${country} "${term}": nenhum anúncio lido`);
        } catch (e) {
          const msg = (e as Error).message;
          if (/pediu login/.test(msg)) loginWalls++;
          errors.push(`${country} "${term}": ${msg}`);
          console.warn(`[meta ${country}] falhou "${term}":`, msg);
        }
        await jitter(3000, 7000);
      }
    } finally {
      await source.close();
    }

    // agrupa por país (a mesma loja em dois países vira duas ofertas)
    const ads = mergeAds(results, ignored);
    const aliases = resolveOfferKeys(ads, client ? await db.loadAliasHints(client, country) : new Map());
    const snaps = buildSnapshots(ads);
    applyCountry(country, ads, snaps, aliases);
    allAds.push(...ads.map((a) => ({ ...a, country })));
    allSnaps.push(...snaps.map((s) => ({ ...s, country })));
    allAliases.push(...aliases);
    perCountry.push(`${country} ${snaps.length}`);
  }

  const avg = perKeyword.length ? Math.round(perKeyword.reduce((a, b) => a + b, 0) / perKeyword.length) : 0;
  console.log(`[meta] ${allAds.length} anúncios únicos, ${allSnaps.length} ofertas, ${allAliases.length} duplicadas juntadas`);
  notes.push(
    `Meta: ${okSearches}/${totalSearches} buscas ok (${watch.length} da espionagem), média de ${avg} anúncios por busca, ${allAds.length} anúncios únicos, ` +
      `${allSnaps.length} ofertas (${perCountry.join(", ")}), ${allAliases.length} duplicadas juntadas` +
      (errors.length ? `. Falhas: ${errors.slice(0, 5).join(" | ")}` : ""),
  );

  // Se a maior parte das buscas falhou, não sobrescreve a foto do dia com dados incompletos
  const healthy = okSearches >= Math.ceil(totalSearches / 2);

  if (client) {
    await db.saveAds(client, allAds);
    await db.saveAliases(client, allAliases);
    if (healthy) await db.saveSnapshots(client, day, allSnaps);
    await db.logRun(client, "meta", healthy, allAds.length, [`média ${avg} anúncios/busca · ${perCountry.join(", ")}`, ...errors].join("\n"));
  } else {
    await mkdir("out", { recursive: true });
    await writeFile(`out/meta-${day}.json`, JSON.stringify({ snaps: allSnaps, aliases: allAliases }, null, 2));
    console.table(allSnaps.slice(0, 20).map((s) => ({ oferta: s.advertiser, pais: s.country, dominio: s.domain, cards: s.cards, copias: s.copies })));
  }
  if (loginWalls >= Math.ceil(totalSearches / 2)) {
    throw new Error(`A Meta pediu login em ${loginWalls} de ${totalSearches} buscas: o IP do GitHub pode estar bloqueado.`);
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
  // ofertas prioritárias (funil, espionagem, top) ganham print e texto completo para o kit
  const keys = await db.priorityKeys(client, num("KIT_OFFERS", 40));
  const shotUrls = await db.landingsNeedingShot(client, keys, num("SHOT_LIMIT", 25));
  const regular = await db.landingsToCheck(client, num("LANDING_LIMIT", 40));
  const urls = [...new Set([...shotUrls, ...regular])];
  if (!urls.length) return;
  const rows = await inspectLandings(urls, new Set(shotUrls));
  await db.saveLandings(client, rows);
  const ok = rows.filter((r) => !r.error).length;
  const shots = rows.filter((r) => r.shot).length;
  await db.logRun(client, "paginas", true, ok, rows.filter((r) => r.error).slice(0, 5).map((r) => `${r.url}: ${r.error}`).join("\n"));
  notes.push(`Páginas de vendas: ${ok}/${rows.length} analisadas, ${shots} com print da página inteira`);
}

/** Classificação com o Gemini (cota grátis): só ofertas novas ou que mudaram. */
async function runAi(client: Db) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    notes.push("IA: pulada (GEMINI_API_KEY não configurada)");
    return;
  }
  const size = num("AI_BATCH", 6);
  const todo = await db.offersForAi(client, size * num("AI_BATCHES", 8), inputHash);
  let done = 0;
  let model = "";
  const errs: string[] = [];
  const models = await aiModels(key);
  console.log("[ia] modelos:", models.join(", "));
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    try {
      const r = await classifyBatch(batch, key, models);
      model = r.model;
      const byKey = new Map(batch.map((b) => [b.key, b.hash]));
      await db.saveInsights(client, r.insights.map((x) => ({ ...x, hash: byKey.get(x.key)!, model: r.model })));
      done += r.insights.length;
    } catch (e) {
      // um lote ruim não derruba os outros; o que faltar entra na próxima coleta
      errs.push((e as Error).message);
      if (done === 0) break; // o primeiro lote já falhou em todos os modelos: não insiste
    }
    if (i + size < todo.length) await new Promise((res) => setTimeout(res, 7000)); // respeita o limite por minuto
  }
  const ok = done > 0 || todo.length === 0;
  await db.logRun(client, "ia", ok, done, [model, ...errs].filter(Boolean).join("\n"));
  notes.push(`IA: ${done}/${todo.length} ofertas classificadas${model ? ` (${model})` : ""}${errs.length ? `. Lotes com falha: ${errs.length} (${errs[0]})` : ""}`);
  if (!ok) throw new Error(`IA: nenhum lote classificado (${errs[0]})`);
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

let modelsCache: string[] | null = null;
const aiModels = async (key: string) => (modelsCache ??= await geminiModels(key));

/** Transcreve os vídeos guardados: fala, gancho dos 3 primeiros segundos, estrutura e chamada. */
async function runTranscripts(client: Db) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return;
  const keys = await db.priorityKeys(client, num("KIT_OFFERS", 40));
  const todo = await db.videosToTranscribe(client, keys, num("TRANSCRIBE_LIMIT", 8));
  if (!todo.length) return;
  const models = await aiModels(key);
  let done = 0;
  const errs: string[] = [];
  for (const v of todo) {
    try {
      const dl = await client.storage.from(MEDIA_BUCKET).download(v.media_path);
      if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "download vazio");
      const r = await transcribeVideo(Buffer.from(await dl.data.arrayBuffer()), key, models);
      await db.saveTranscript(client, v.library_id, r.transcript, r.model);
      done++;
    } catch (e) {
      errs.push(`${v.library_id}: ${(e as Error).message}`);
      if (done === 0 && errs.length >= 2) break; // IA fora do ar: tenta na próxima coleta
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  await db.logRun(client, "transcricao", done > 0, done, errs.slice(0, 3).join("\n"));
  notes.push(`Transcrição de vídeos: ${done}/${todo.length}${errs.length ? ` (falha: ${errs[0].slice(0, 160)})` : ""}`);
}

/** Kit de modelagem: a IA monta o mapa da página e do funil das ofertas prioritárias. */
async function runKits(client: Db) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return;
  const keys = await db.priorityKeys(client, num("KIT_OFFERS", 40));
  const todo = await db.kitsToBuild(client, keys, num("KIT_LIMIT", 8), kitHash);
  if (!todo.length) return;
  const models = await aiModels(key);
  let done = 0;
  const errs: string[] = [];
  for (const k of todo) {
    try {
      const r = await buildKit(k, key, models);
      await db.saveKit(client, k.key, r.kit, r.model, k.hash);
      done++;
    } catch (e) {
      errs.push(`${k.key}: ${(e as Error).message}`);
      if (done === 0 && errs.length >= 2) break;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  await db.logRun(client, "kit", done > 0, done, errs.slice(0, 3).join("\n"));
  notes.push(`Kit de modelagem: ${done}/${todo.length} mapas de página${errs.length ? ` (falha: ${errs[0].slice(0, 160)})` : ""}`);
}

/** Guarda o arquivo original (vídeo/imagem) dos melhores anúncios para baixar em 1 clique. */
async function runMedia(client: Db) {
  const keys = await db.priorityKeys(client, num("MEDIA_OFFERS", 40));
  const items = await db.mediaToStore(client, keys, num("MEDIA_PER_OFFER", 3), num("MEDIA_LIMIT", 60));
  const r = items.length ? await storeMedia(client, items) : { saved: 0, failed: 0, skipped: 0, bytes: 0 };
  const pruned = await pruneMedia(client, num("MEDIA_BUDGET_MB", 600) * 1024 * 1024, new Set(keys));
  await db.logRun(client, "midia", r.failed < Math.max(items.length, 1), r.saved, [r.failed ? `${r.failed} falharam` : "", r.skipped ? `${r.skipped} grandes demais` : "", pruned ? `${pruned} antigos apagados` : ""].filter(Boolean).join(", "));
  notes.push(`Mídia original: ${r.saved} arquivos guardados (${Math.round(r.bytes / 1048576)} MB)${r.failed ? `, ${r.failed} falharam` : ""}${r.skipped ? `, ${r.skipped} acima de 45 MB` : ""}${pruned ? `, ${pruned} antigos apagados para caber no plano grátis` : ""}`);
}

/** Avisos no Telegram: oferta nova no top 20 e disparo de cópias. */
async function runAlerts(client: Db) {
  if (!telegramConfigured()) {
    notes.push("Alertas: pulados (Telegram não configurado)");
    return;
  }
  await db.resolveWatch(client);
  const rows = await db.rankingForAlerts(client);
  const sent = await db.loadSentAlerts(client);
  const { firstRun, toSend, toMark, top } = computeAlerts(rows, sent);
  if (firstRun) await sendTelegram(formatWelcome(top));
  else if (toSend.length) await sendTelegram(formatAlerts(toSend));
  await db.markAlerts(client, toMark);

  // espionagem: criativo novo de quem você segue
  const watch = await db.watchNews(client, sent);
  if (watch.news.length) await sendTelegram(formatWatch(watch.news));
  await db.markAlerts(client, watch.toMark.map((key) => ({ key, kind: "watch" })));

  // funil: oferta que você está modelando/testando perdendo força (1 aviso por semana)
  const WEEK = 7 * 864e5;
  const cooling = (await db.coolingInFunnel(client)).filter((r) => {
    const t = sent.get(`${r.offer_key}|esfriando`);
    return t === undefined || Date.now() - t > WEEK;
  });
  if (cooling.length) await sendTelegram(formatCooling(cooling));
  await db.markAlerts(client, cooling.map((r) => ({ key: r.offer_key, kind: "esfriando" })));

  notes.push(`Alertas: ${firstRun ? "primeira mensagem enviada" : `${toSend.length} enviados`}, espionagem ${watch.news.length}, esfriando ${cooling.length}`);
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
    if (want("midia")) await step("midia", () => runMedia(client));
    if (want("google")) await step("google", () => runGoogle(client, day));
    if (want("ra")) await step("reclameaqui", () => runRa(client, day));
    if (want("paginas")) await step("paginas", () => runLandings(client));
    if (want("ia")) await step("ia", () => runAi(client));
    if (want("kit")) await step("kit", () => runKits(client));
    if (want("transcricao")) await step("transcricao", () => runTranscripts(client));
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
