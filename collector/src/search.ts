import { writeFile } from "node:fs/promises";
import * as db from "./db.js";
import { executeSearch, processPendingSearches, siteOf } from "./pesquisa.js";
import { closeBrowser } from "./sources/browser.js";

/**
 * Pesquisar agora (workflow "Pesquisar agora", disparado pelo painel): roda as pesquisas pendentes.
 *
 * Teste local sem banco:  npm run search -- --termo="pagamento na entrega" --pais=BR
 *                         npm run search -- --termo=loja.com.br
 */
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";

async function main() {
  const client = db.getDb();
  let failed = 0;
  let done = 0;
  try {
    if (!client) {
      const term = arg("termo");
      if (!term) throw new Error('Sem banco configurado: passe --termo="..." para testar (ex.: --termo=loja.com.br).');
      const site = siteOf(term);
      const out = await executeSearch({ term: site ?? term, kind: site ? "site" : "palavra", match: arg("qualquer") ? "qualquer" : "exata", country: (arg("pais") || "BR").toUpperCase() });
      console.log(`total na Meta: ${out.total ?? "?"} · lidos: ${out.ads.length} · Google: ${out.google ?? "—"} ${out.message}`);
      console.table(out.ads.slice(0, 30).map((a) => ({ anunciante: a.advertiser, dominio: a.domain, oferta: a.offerKey, copias: a.copies, desde: a.startDate, leva_ao_site: a.siteMatch })));
      await writeFile("out-pesquisa.json", JSON.stringify(out, null, 2));
      return;
    }
    const r = await processPendingSearches(client);
    console.log(`[pesquisa] ${r.done} prontas, ${r.failed} com erro${r.pruned ? `, ${r.pruned} antigas apagadas` : ""}`);
    failed = r.failed;
    done = r.done;
    if (process.env.GITHUB_STEP_SUMMARY && r.notes.length) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Pesquisas\n\n${r.notes.map((n) => `- ${n}`).join("\n")}\n`, { flag: "a" }).catch(() => {});
    }
  } finally {
    await closeBrowser();
  }
  // o erro de cada pesquisa fica gravado nela (o painel mostra); o job só fica vermelho se nenhuma deu certo
  if (failed && !done) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
