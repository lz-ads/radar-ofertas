import { strict as assert } from "node:assert";
import { test } from "node:test";
import sharp from "sharp";
import { buildKit, buildKitPrompt, kitHash, transcribeVideo, type KitInput } from "../src/ai.js";
import { flagOf, formatCooling, formatWatch } from "../src/alerts.js";
import { applyCountry, buildSnapshots, countryOfKey, mergeAds, rawKey, resolveOfferKeys, scopeKey } from "../src/aggregate.js";
import { extractForeignPrices } from "../src/landing.js";
import { fileTypeFor, MAX_FILE, pruneMedia, storeMedia } from "../src/media.js";
import { toPageShot } from "../src/sources/landingBrowser.js";
import type { KeywordResult } from "../src/types.js";

const ad = (id: string, advertiser: string, domain: string | null, copies = 1) => ({
  libraryId: id, advertiser, domain, body: "texto", startDate: "2026-09-01", copies,
});

test("países: chave com país fora do Brasil, Brasil fica igual", () => {
  assert.equal(scopeKey("d:loja.com", "BR"), "d:loja.com");
  assert.equal(scopeKey("d:loja.com", "us"), "us:d:loja.com");
  assert.equal(countryOfKey("jp:a:ショップ"), "JP");
  assert.equal(countryOfKey("d:loja.com"), "BR");
  assert.equal(rawKey("gb:d:shop.co.uk"), "d:shop.co.uk");
  assert.equal(flagOf("us:d:loja.com"), "🇺🇸 ");
  assert.equal(flagOf("d:loja.com"), "");
});

test("países: agrupa por país e aplica o prefixo em anúncios, ofertas e apelidos", () => {
  const results: KeywordResult[] = [
    { keyword: "free shipping", totalResults: null, ads: [ad("1", "Shop", "shop.com", 4), ad("2", "Shop", null, 2)] },
  ];
  const ads = mergeAds(results, new Set());
  const aliases = resolveOfferKeys(ads);
  const snaps = buildSnapshots(ads);
  applyCountry("US", ads, snaps, aliases);
  assert.deepEqual(ads.map((a) => a.offerKey), ["us:d:shop.com", "us:d:shop.com"]);
  assert.equal(snaps[0].offerKey, "us:d:shop.com");
  assert.equal(snaps[0].domain, "shop.com");
  assert.deepEqual(aliases, [{ alias: "us:a:shop", target: "us:d:shop.com" }]);
});

test("países: preços em dólar, libra, euro e iene", () => {
  assert.deepEqual(extractForeignPrices("Today $39.95, 3 for $89"), { currency: "USD", prices: [39.95, 89] });
  assert.equal(extractForeignPrices("初回限定 1,980円").currency, "JPY");
  assert.deepEqual(extractForeignPrices("sem preço"), { currency: null, prices: [] });
});

test("download: tipo do arquivo", () => {
  assert.deepEqual(fileTypeFor("video", "application/octet-stream"), { ext: "mp4", type: "video/mp4" });
  assert.deepEqual(fileTypeFor("image", "image/png"), { ext: "png", type: "image/png" });
  assert.deepEqual(fileTypeFor("image", null), { ext: "jpg", type: "image/jpeg" });
});

/** Banco falso: guarda uploads e updates para conferir. */
function fakeDb(rows: Record<string, unknown>[] = []) {
  const uploads: string[] = [];
  const removed: string[] = [];
  const updates: { set: Record<string, unknown>; where: unknown }[] = [];
  const db = {
    storage: {
      from: () => ({
        upload: async (path: string) => (uploads.push(path), { error: null }),
        remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
      }),
    },
    from: () => {
      const q = {
        update: (set: Record<string, unknown>) => ({
          eq: async (_c: string, v: unknown) => (updates.push({ set, where: v }), { error: null }),
          in: async (_c: string, v: unknown) => (updates.push({ set, where: v }), { error: null }),
        }),
        select: () => q,
        not: () => q,
        order: () => q,
        range: async () => ({ data: rows, error: null }),
      };
      return q;
    },
  };
  return { db: db as never, uploads, removed, updates };
}

test("download: guarda vídeo e imagem, pula arquivo grande demais", async () => {
  const { db, uploads, updates } = fakeDb();
  const fake = (async (url: string) => {
    if (url.includes("grande")) return new Response("x", { headers: { "content-length": String(MAX_FILE + 1) } });
    const ct = url.includes("video") ? "video/mp4" : "image/png";
    return new Response(new Uint8Array(5000), { headers: { "content-type": ct } });
  }) as typeof fetch;
  const r = await storeMedia(db, [
    { libraryId: "1", url: "https://video.fbcdn/video.mp4", kind: "video" },
    { libraryId: "2", url: "https://scontent.fbcdn/img", kind: "image" },
    { libraryId: "3", url: "https://video.fbcdn/grande.mp4", kind: "video" },
  ], fake);
  assert.deepEqual(r, { saved: 2, failed: 0, skipped: 1, bytes: 10000 });
  assert.deepEqual(uploads, ["ads/1.mp4", "ads/2.png"]);
  assert.equal(updates[0].set.media_path, "ads/1.mp4");
});

test("download: orçamento apaga primeiro quem saiu da lista de prioridade", async () => {
  const MB = 1024 * 1024;
  const { db, removed } = fakeDb([
    { library_id: "a", offer_key: "d:velha.com", media_path: "ads/a.mp4", media_bytes: 30 * MB, last_seen: "2026-10-01" },
    { library_id: "b", offer_key: "d:top.com", media_path: "ads/b.mp4", media_bytes: 30 * MB, last_seen: "2026-10-02" },
    { library_id: "c", offer_key: "d:top.com", media_path: "ads/c.mp4", media_bytes: 30 * MB, last_seen: "2026-10-03" },
  ]);
  const n = await pruneMedia(db, 70 * MB, new Set(["d:top.com"]));
  assert.equal(n, 1);
  assert.deepEqual(removed, ["ads/a.mp4"]);
});

test("kit: print da página vira webp e é cortado na altura máxima", async () => {
  const png = await sharp({ create: { width: 390, height: 20000, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const shot = await toPageShot(png);
  const meta = await sharp(shot).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.height, 15000);
});

const kitInput: KitInput = {
  key: "d:loja.com", advertiser: "Loja", domain: "loja.com", url: "https://loja.com/p", pageText: "Headline forte. Compre 2 leve 3. Garantia de 30 dias.",
  prices: [97, 197], currency: "BRL", checkout: "Yampi", platform: "Shopify", adTexts: ["Anúncio 1"],
};

test("kit: prompt leva página, anúncios e preços; hash muda quando a página muda", () => {
  const p = buildKitPrompt(kitInput);
  assert.match(p, /TEXTO DA PÁGINA:\nHeadline forte/);
  assert.match(p, /97, 197 BRL/);
  assert.match(p, /NÃO copie/);
  assert.notEqual(kitHash(kitInput), kitHash({ ...kitInput, pageText: "outra" }));
});

const geminiReply = (obj: unknown) =>
  (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 })) as unknown as () => Promise<Response>;

test("kit: lê a estrutura devolvida pela IA", async () => {
  const kit = {
    resumo: "r", publico: "p", promessa: "pr", mecanismo: "m", angulo: "a",
    secoes: [{ tipo: "headline", titulo: "t", resumo: "x" }],
    oferta: { kits: [{ nome: "Kit 3", preco: "R$ 197" }], bonus: [], garantia: "30 dias", frete: "grátis", pagamento: "pix", escassez: "" },
    provas: [], objecoes: [], ctas: ["Comprar"], funil: "página → Yampi", ideias_de_teste: ["a"],
  };
  const r = await buildKit(kitInput, "k", ["m1"], geminiReply(kit) as unknown as typeof fetch);
  assert.equal(r.model, "m1");
  assert.equal(r.kit.oferta.kits[0].preco, "R$ 197");
});

test("transcrição: manda o vídeo junto e devolve gancho e estrutura", async () => {
  let sent = "";
  const fake = (async (_u: string, init: RequestInit) => {
    sent = String(init.body);
    return geminiReply({ transcricao: "Olá", gancho: "Pare de sofrer", estrutura: "gancho → oferta", cta: "Clique" })();
  }) as typeof fetch;
  const r = await transcribeVideo(Buffer.from("video-falso"), "k", ["m"], fake);
  assert.equal(r.transcript.gancho, "Pare de sofrer");
  assert.match(sent, /"mimeType":"video\/mp4"/);
});

test("alertas: espionagem e funil esfriando", () => {
  const w = formatWatch([{ key: "us:d:shop.com", label: "Shop", newAds: 3 }]);
  assert.match(w, /Shop<\/b> soltou 3 criativos novos/);
  assert.match(w, /oferta\/us%3Ad%3Ashop\.com/);
  const c = formatCooling([{ offer_key: "d:x.com", advertiser: "X", copies: 4, copies_7d: 20, status: "testando" }]);
  assert.match(c, /20 → 4 cópias/);
});
