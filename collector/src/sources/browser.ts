import { chromium, type Browser, type BrowserContext } from "playwright";

let browser: Browser | null = null;

/** Navegador compartilhado pelos coletores, com cara de visitante brasileiro. */
export async function newContext(locale = "pt-BR", opts: { mobile?: boolean } = {}): Promise<BrowserContext> {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.HEADFUL !== "1",
      args: ["--disable-blink-features=AutomationControlled"],
      // para testes locais com um Chromium já instalado em outro lugar
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
  }
  const mobile = opts.mobile
    ? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      }
    : {
        viewport: { width: 1366, height: 900 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      };
  return browser.newContext({
    locale,
    timezoneId: "America/Sao_Paulo",
    ...mobile,
    extraHTTPHeaders: { "Accept-Language": locale === "pt-BR" ? "pt-BR,pt;q=0.9" : "en-US,en;q=0.9" },
  });
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pausa aleatória entre ações, para não parecer robô. */
export const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
