import { parseRaRanking } from "../parse/reclameaqui.js";
import type { RaCompany } from "../types.js";
import { jitter, newContext } from "./browser.js";

/** Lê o ranking de empresas recém-cadastradas com mais reclamações. */
export async function fetchRaNewCompanies(): Promise<RaCompany[]> {
  const ctx = await newContext("pt-BR");
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.reclameaqui.com.br/ranking/recem-cadastradas/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector("main", { timeout: 20_000 });
    await jitter(1500, 2500);
    const more = page.getByRole("button", { name: /Mostrar mais empresas/i });
    if (await more.count()) {
      await more.first().click().catch(() => {});
      await jitter(1200, 2000);
    }
    const text = await page.locator("main").innerText();
    const slugs = await page.$$eval("main a[href*='/empresa/']", (as) =>
      as.map((a) => (a as HTMLAnchorElement).href.match(/\/empresa\/([^/]+)/)?.[1] ?? ""),
    );
    return parseRaRanking(text, [...new Set(slugs.filter(Boolean))]);
  } finally {
    await ctx.close();
  }
}
