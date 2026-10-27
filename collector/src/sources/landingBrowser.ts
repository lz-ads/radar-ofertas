import { analyzeLanding, type LandingInfo } from "../landing.js";
import { jitter, newContext } from "./browser.js";

/** Visita cada página de vendas num navegador (sem baixar imagens e vídeos) e faz o raio-X. */
export async function inspectLandings(urls: string[]): Promise<LandingInfo[]> {
  const out: LandingInfo[] = [];
  if (!urls.length) return out;
  const ctx = await newContext("pt-BR");
  await ctx.route("**/*", (route) => {
    const t = route.request().resourceType();
    return ["image", "media", "font"].includes(t) ? route.abort() : route.continue();
  });
  try {
    for (const url of urls) {
      const page = await ctx.newPage();
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
        // páginas com vídeo de vendas costumam liberar o preço depois: rola para carregar o resto
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
        await jitter(1200, 1800);
        const html = await page.content();
        const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
        out.push(analyzeLanding(url, html, text, page.url(), res?.status() ?? null));
      } catch (e) {
        out.push({ ...analyzeLanding(url, "", ""), error: (e as Error).message.split("\n")[0].slice(0, 300) });
      } finally {
        await page.close().catch(() => {});
      }
      await jitter(800, 1600);
    }
  } finally {
    await ctx.close();
  }
  return out;
}
