import { mkdir, writeFile } from "node:fs/promises";
import { buildSnapshots, mergeAds } from "./aggregate.js";
import * as db from "./db.js";
import { closeBrowser, jitter } from "./sources/browser.js";
import { GoogleTransparencySource } from "./sources/googleBrowser.js";
import { MetaBrowserSource } from "./sources/metaBrowser.js";
import { fetchRaNewCompanies } from "./sources/reclameAquiBrowser.js";
import type { KeywordResult, MetaAdSource } from "./types.js";

// Usado só quando o banco não está configurado (teste local)
const FALLBACK_KEYWORDS = ["pagamento na entrega", "compre 2 leve 3", "acesso imediato"];

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const want = (s: string) => only.length === 0 || only.includes(s);

/**
 * Troque aqui pela fonte paga quando quiser (ex.: new ApifyMetaSource()).
 * Qualquer classe que implemente MetaAdSource funciona.
 */
function makeMetaSource(): MetaAdSource {
  return new MetaBrowserSource({ scrolls: Number(process.env.META_SCROLLS || 6) });
}

async function runMeta(client: ReturnType<typeof db.getDb>, day: string) {
  const keywords = client ? await db.loadKeywords(client) : FALLBACK_KEYWORDS;
  const ignored = client ? await db.loadIgnored(client) : new Set<string>();
  const source = makeMetaSource();
  const results: KeywordResult[] = [];
  const errors: string[] = [];

  try {
    for (const term of keywords) {
      try {
        const r = await source.searchKeyword(term);
        console.log(`[meta] "${term}": ${r.ads.length} anúncios (${r.totalResults ?? "?"})`);
        if (r.ads.length) results.push(r);
        else errors.push(`"${term}": nenhum anúncio lido`);
      } catch (e) {
        errors.push(`"${term}": ${(e as Error).message}`);
        console.warn(`[meta] falhou "${term}":`, (e as Error).message);
      }
      await jitter(3000, 7000);
    }
  } finally {
    await source.close();
  }

  const ads = mergeAds(results, ignored);
  const snaps = buildSnapshots(ads);
  console.log(`[meta] ${ads.length} anúncios únicos, ${snaps.length} ofertas`);

  // Se a maior parte das buscas falhou, não sobrescreve a foto do dia com dados incompletos
  const healthy = results.length >= Math.ceil(keywords.length / 2);

  if (client) {
    await db.saveAds(client, ads);
    if (healthy) await db.saveSnapshots(client, day, snaps);
    await db.logRun(client, "meta", healthy, ads.length, errors.join("\n"));
  } else {
    await mkdir("out", { recursive: true });
    await writeFile(`out/meta-${day}.json`, JSON.stringify({ results, snaps }, null, 2));
    console.table(snaps.slice(0, 20).map((s) => ({ oferta: s.advertiser, dominio: s.domain, cards: s.cards, copias: s.copies, paginas: s.pages })));
  }
  if (!healthy) throw new Error(`Coleta da Meta incompleta: ${errors.length} buscas falharam.\n${errors.join("\n")}`);
}

async function runGoogle(client: NonNullable<ReturnType<typeof db.getDb>>, day: string) {
  const domains = await db.domainsNeedingGoogle(client, day, Number(process.env.GOOGLE_LIMIT || 40));
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
}

async function runRa(client: ReturnType<typeof db.getDb>, day: string) {
  if (client && (await db.raAlreadyToday(client, day))) {
    console.log("[ra] já coletado hoje");
    return;
  }
  const rows = await fetchRaNewCompanies();
  console.log(`[ra] ${rows.length} empresas`);
  if (client) {
    await db.saveRa(client, day, rows);
    await db.logRun(client, "reclameaqui", rows.length > 0, rows.length);
  } else {
    console.table(rows);
  }
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
      await db.logRun(client, name, false, 0, (e as Error).message);
    }
  };

  if (want("meta")) await step("meta", () => runMeta(client, day));
  if (want("google") && client) await step("google", () => runGoogle(client, day));
  if (want("ra")) await step("reclameaqui", () => runRa(client, day));

  await closeBrowser();
  if (failures.length) {
    console.error("\nFalhas:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main();
