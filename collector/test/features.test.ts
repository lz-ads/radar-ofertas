import { strict as assert } from "node:assert";
import { test } from "node:test";
import sharp from "sharp";
import { buildPrompt, classifyBatch, inputHash, parseInsights } from "../src/ai.js";
import { computeAlerts, formatAlerts, isSurge, type RankRow } from "../src/alerts.js";
import { buildSnapshots, mergeAds, resolveOfferKeys } from "../src/aggregate.js";
import { toThumb } from "../src/creatives.js";
import { analyzeLanding, extractPrices, isVisitable } from "../src/landing.js";
import { destTypeFor, isGenericDomain, offerKeyFor, parseMetaLibraryText } from "../src/parse/meta.js";
import type { MetaAd } from "../src/types.js";

const ad = (o: Partial<MetaAd> & { libraryId: string; advertiser: string }): MetaAd => ({
  domain: null, body: "texto", startDate: "2026-09-01", copies: 1, ...o,
});

test("item 1: plataformas com subdomínio por loja não juntam lojas diferentes", () => {
  assert.equal(offerKeyFor({ domain: "loja-a.myshopify.com", advertiser: "A" }), "d:loja-a.myshopify.com");
  assert.equal(offerKeyFor({ domain: "loja-b.myshopify.com", advertiser: "B" }), "d:loja-b.myshopify.com");
  assert.equal(offerKeyFor({ domain: "pay.hotmart.com", advertiser: "Curso X" }), "a:curso x");
  assert.equal(offerKeyFor({ domain: "pilates.laystrancoso.com", advertiser: "L" }), "d:laystrancoso.com");
  assert.equal(offerKeyFor({ domain: "loja.com.br", advertiser: "L" }), "d:loja.com.br");
  assert.equal(isGenericDomain("pay.kiwify.com.br"), true);
  assert.equal(isGenericDomain("minhaloja.lojavirtualnuvem.com.br"), false);
});

test("item 1: anúncio sem site entra na oferta do mesmo anunciante", () => {
  const ads = mergeAds([{ keyword: "k", totalResults: null, ads: [
    ad({ libraryId: "1", advertiser: "Help Global Brazil", domain: "helpglobal.com.br", copies: 9, pageUrl: "https://www.facebook.com/help/" }),
    ad({ libraryId: "2", advertiser: "Help Global Brazil", copies: 5 }),
    ad({ libraryId: "3", advertiser: "Outra Página", copies: 2, pageUrl: "https://www.facebook.com/help/" }),
    ad({ libraryId: "4", advertiser: "Sem Site", copies: 3 }),
  ] }], new Set());
  const aliases = resolveOfferKeys(ads);
  assert.deepEqual(aliases.sort((a, b) => a.alias.localeCompare(b.alias)), [
    { alias: "a:help global brazil", target: "d:helpglobal.com.br" },
    { alias: "a:outra pagina", target: "d:helpglobal.com.br" },
  ]);
  const snaps = buildSnapshots(ads);
  assert.equal(snaps.length, 2);
  const help = snaps.find((s) => s.offerKey === "d:helpglobal.com.br")!;
  assert.equal(help.copies, 16);
  assert.equal(help.cards, 3);
});

test("item 1: anunciante com vários sites diferentes não é juntado; dica do banco funciona", () => {
  const ads = mergeAds([{ keyword: "k", totalResults: null, ads: [
    ad({ libraryId: "1", advertiser: "Loja", domain: "a.com", copies: 5 }),
    ad({ libraryId: "2", advertiser: "Loja", domain: "b.com", copies: 5 }),
    ad({ libraryId: "3", advertiser: "Loja", copies: 1 }),
    ad({ libraryId: "4", advertiser: "Antiga", copies: 1 }),
  ] }], new Set());
  const aliases = resolveOfferKeys(ads, new Map([["antiga", "d:antiga.com"]]));
  assert.deepEqual(aliases, [{ alias: "a:antiga", target: "d:antiga.com" }]);
});

test("item 3: tipo de destino", () => {
  assert.equal(destTypeFor({ domain: "api.whatsapp.com", cta: "Enviar mensagem" }), "whatsapp");
  assert.equal(destTypeFor({ domain: null, cta: "Send WhatsApp Message" }), "whatsapp");
  assert.equal(destTypeFor({ domain: "instagram.com", cta: null }), "instagram");
  assert.equal(destTypeFor({ domain: "play.google.com", cta: "Install Now" }), "app");
  assert.equal(destTypeFor({ domain: "loja.com.br", cta: "Shop Now" }), "site");
  assert.equal(destTypeFor({ domain: null, cta: "Cadastre-se" }), "formulario");
  assert.equal(destTypeFor({ domain: null, cta: "Enviar mensagem" }), "mensagem");
  assert.equal(destTypeFor({ domain: null, cta: null }), null);
});

test("item 3: CTA lido do card e página inicial quando o card não tem link", () => {
  const text = "Identificação da biblioteca: 9\nVeiculação iniciada em 1 de out de 2026\nLoja X\nPatrocinado\nTexto do anúncio\nLOJAX.COM.BR\nComprar agora\n";
  const { ads } = parseMetaLibraryText(text);
  assert.equal(ads[0].cta, "Comprar agora");
  const [m] = mergeAds([{ keyword: "k", totalResults: null, ads }], new Set());
  assert.equal(m.landingUrl, "https://lojax.com.br/");
  assert.equal(m.destType, "site");
});

test("item 4: preços, parcelas e raio-X da página", () => {
  const { prices, installments } = extractPrices("De R$ 297,00 por R$ 97,00 ou 12x de R$ 9,74. Kit 3 potes R$ 1.297,90");
  assert.deepEqual(prices, [97, 297, 1297.9]);
  assert.equal(installments, "12x de R$ 9,74");

  const html = `<html><head><title>Kit Detox 3 Potes</title><meta name="description" content="Seca barriga">
    <script src="https://cdn.shopify.com/s/x.js"></script><script>!function(f){fbq('init','1')}</script>
    <script src="https://scripts.converteai.net/player.js"></script></head>
    <body><a href="https://wa.me/5511999">zap</a><div class="countdown"></div></body></html>`;
  const text = "Kit Detox\nDe R$ 297,00 por R$ 147,00\nPagamento na entrega para todo o Brasil";
  const r = analyzeLanding("https://detox.com.br/kit", html, text, "https://detox.com.br/kit", 200);
  assert.equal(r.title, "Kit Detox 3 Potes");
  assert.equal(r.description, "Seca barriga");
  assert.equal(r.platform, "Shopify");
  assert.equal(r.checkout, "Shopify");
  assert.equal(r.priceMin, 147);
  assert.equal(r.priceMax, 297);
  assert.equal(r.cod, true);
  assert.equal(r.hasVsl, true);
  assert.equal(r.hasCountdown, true);
  assert.equal(r.hasWhatsapp, true);
  assert.deepEqual(r.pixels, ["Meta"]);

  const info = analyzeLanding("https://curso.com", `<a href="https://pay.hotmart.com/A1">comprar</a><script src="https://analytics.tiktok.com/x"></script><link href="/wp-content/x.css">`, "Acesso imediato por R$ 47");
  assert.equal(info.checkout, "Hotmart");
  assert.equal(info.platform, "WordPress");
  assert.deepEqual(info.pixels, ["TikTok"]);
  assert.equal(info.cod, false);

  assert.equal(isVisitable("https://api.whatsapp.com/send?phone=1"), false);
  assert.equal(isVisitable("https://loja.com.br/"), true);
  assert.equal(isVisitable(null), false);
});

test("item 5: prompt, leitura da resposta e troca de modelo do Gemini", async () => {
  const input = { key: "d:x.com", advertiser: "X", domain: "x.com", texts: ["Emagreça 10kg"], landingTitle: "Kit", landingExcerpt: "R$ 97" };
  assert.match(buildPrompt([input]), /"key":"d:x.com"/);
  assert.equal(inputHash(input), inputHash({ ...input }));
  assert.notEqual(inputHash(input), inputHash({ ...input, texts: ["outro"] }));

  const parsed = parseInsights('```json\n[{"key":"d:x.com","nicho":"Emagrecimento","tipo":"nutra","publico":"mulheres 40+","promessa":"secar","mecanismo":"chá","oferta":"kit 3","risco":"alto","motivo_risco":"perda de peso"},{"key":"intruso","nicho":"x"}]\n```', ["d:x.com"]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].nicho, "Emagrecimento");
  assert.equal(parseInsights('[{"key":"d:x.com","nicho":"Inventado","tipo":"?","risco":"?"}]', ["d:x.com"])[0].nicho, "Outros");
  assert.deepEqual(parseInsights("não é json", ["a"]), []);

  const calls: string[] = [];
  const fakeFetch = (async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("modelo-velho")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"key":"d:x.com","nicho":"Emagrecimento","tipo":"nutra","publico":"p","promessa":"p","mecanismo":"m","oferta":"o","risco":"alto","motivo_risco":"r"}]' }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await classifyBatch([input], "chave", ["modelo-velho", "gemini-flash-latest"], fakeFetch);
  assert.equal(r.model, "gemini-flash-latest");
  assert.equal(r.insights[0].tipo, "nutra");
  assert.equal(calls.length, 2);
});

test("item 6: criativo vira webp pequeno", async () => {
  const png = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#2f6bff" } }).png().toBuffer();
  const out = await toThumb(png);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width! <= 360 && meta.height! <= 640);
  assert.ok(out.length < 20_000);
});

test("item 7: alertas sem repetição e sem enxurrada na primeira vez", () => {
  const row = (k: string, score: number, copies: number, c7: number | null): RankRow => ({
    offer_key: k, advertiser: k.toUpperCase(), domain: `${k}.com`, score, copies, copies_7d: c7, copies_growth: c7 === null ? 0 : copies - c7, niche: "Emagrecimento",
  });
  const rows = [row("a", 100, 40, 20), row("b", 50, 8, 7), row("c", 10, 6, 2)];
  assert.equal(isSurge(rows[0]), true);  // +20
  assert.equal(isSurge(rows[1]), false); // +1
  assert.equal(isSurge(rows[2]), true);  // triplicou

  const first = computeAlerts(rows, new Map());
  assert.equal(first.firstRun, true);
  assert.equal(first.toSend.length, 0);
  assert.ok(first.toMark.length >= 3);

  const now = Date.now();
  const sent = new Map<string, number>([["a|top", now], ["a|disparo", now], ["b|top", now - 8 * 864e5]]);
  const next = computeAlerts(rows, sent, now);
  assert.deepEqual(next.toSend.map((a) => `${a.key}|${a.kind}`).sort(), ["b|top", "c|disparo"]);
  const msg = formatAlerts(next.toSend);
  assert.match(msg, /2 novidades/);
  assert.match(msg, /🔥 <b>C<\/b> \+4 cópias/);
  assert.match(msg, /\/oferta\/c/);
});

test("wellFormed troca metade solta de emoji (Postgres recusa)", async () => {
  const { wellFormed } = await import("../src/db.js");
  const cut = "Oferta 🔥".slice(0, 8); // corta o emoji no meio
  const out = wellFormed({ a: cut, b: ["ok 🔥"], n: 3 });
  assert.equal(out.a, "Oferta �");
  assert.equal(out.b[0], "ok 🔥");
  assert.equal(out.n, 3);
});
