import sharp from "sharp";
import { analyzeLanding, type LandingInfo } from "../landing.js";
import { jitter, newContext } from "./browser.js";

/** Altura máxima do print (a maioria das páginas de vendas cabe; o webp aceita até 16383 px). */
const MAX_SHOT_HEIGHT = 15000;

/** Print da página inteira em webp leve, na largura do celular (como o público do anúncio vê). */
export async function toPageShot(png: Buffer): Promise<Buffer> {
  const img = sharp(png, { limitInputPixels: false });
  const meta = await img.metadata();
  const h = Math.min(meta.height ?? MAX_SHOT_HEIGHT, MAX_SHOT_HEIGHT);
  return img.extract({ left: 0, top: 0, width: meta.width ?? 390, height: h }).webp({ quality: 50 }).toBuffer();
}

/**
 * Visita cada página de vendas no celular e faz o raio-X. Para as páginas em `shots`
 * também guarda o texto completo e o print da página inteira (kit de modelagem).
 */
export async function inspectLandings(urls: string[], shots: Set<string> = new Set()): Promise<LandingInfo[]> {
  const out: LandingInfo[] = [];
  if (!urls.length) return out;
  // dois navegadores: sem imagens (rápido) e com imagens (para o print sair completo)
  const fast = await newContext("pt-BR", { mobile: true });
  await fast.route("**/*", (route) => (["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
  const full = shots.size ? await newContext("pt-BR", { mobile: true }) : null;
  await full?.route("**/*", (route) => (["media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
  try {
    for (const url of urls) {
      const wantShot = !!full && shots.has(url);
      const page = await (wantShot ? full! : fast).newPage();
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
        if (wantShot) {
          // rola aos poucos para carregar as imagens "preguiçosas" antes do print
          for (let i = 0; i < 40; i++) {
            const done = await page
              .evaluate(() => {
                window.scrollBy(0, 700);
                const el = document.scrollingElement ?? document.documentElement;
                return el.scrollTop + window.innerHeight >= el.scrollHeight - 5;
              })
              .catch(() => true);
            await page.waitForTimeout(220);
            if (done) break;
          }
          await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
          await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
          await page.waitForTimeout(400);
        } else {
          // páginas com vídeo de vendas costumam liberar o preço depois: rola para carregar o resto
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
          await jitter(1200, 1800);
        }
        const html = await page.content();
        const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
        const info = analyzeLanding(url, html, text, page.url(), res?.status() ?? null);
        if (wantShot) {
          info.fullText = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30_000) || null;
          try {
            const height = await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollHeight).catch(() => 4000);
            const png = await page.screenshot({
              type: "png",
              fullPage: true,
              clip: { x: 0, y: 0, width: 390, height: Math.min(Math.max(height, 844), MAX_SHOT_HEIGHT) },
              timeout: 30_000,
            });
            info.shot = await toPageShot(png);
          } catch (e) {
            console.warn(`[paginas] print falhou ${url}:`, (e as Error).message.split("\n")[0]);
          }
        }
        out.push(info);
      } catch (e) {
        out.push({ ...analyzeLanding(url, "", ""), error: (e as Error).message.split("\n")[0].slice(0, 300) });
      } finally {
        await page.close().catch(() => {});
      }
      await jitter(800, 1600);
    }
  } finally {
    await fast.close();
    await full?.close();
  }
  return out;
}
