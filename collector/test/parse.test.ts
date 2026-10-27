import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildSnapshots, mergeAds } from "../src/aggregate.js";
import { parseGoogleCount } from "../src/parse/google.js";
import { offerKeyFor, parseMetaLibraryText, parsePtDate } from "../src/parse/meta.js";
import { parseRaRanking } from "../src/parse/reclameaqui.js";

const sample = readFileSync(new URL("./fixtures/meta-sample.txt", import.meta.url), "utf8");

test("datas em português", () => {
  assert.equal(parsePtDate("Veiculação iniciada em 29 de set de 2026"), "2026-09-29");
  assert.equal(parsePtDate("4 de ago de 2026 · Tempo total ativo: 6h"), "2026-08-04");
  assert.equal(parsePtDate("sem data"), null);
});

test("lê os anúncios da Biblioteca da Meta", () => {
  const { total, ads } = parseMetaLibraryText(sample);
  assert.equal(total, ">50.000 resultados");
  assert.equal(ads.length, 6);

  const shopee = ads[0];
  assert.equal(shopee.libraryId, "1962025141420365");
  assert.equal(shopee.advertiser, "Shopee");
  assert.equal(shopee.domain, "shopee.com.br");
  assert.equal(shopee.copies, 1);
  assert.equal(shopee.startDate, "2026-09-29");

  const infinite = ads[1];
  assert.equal(infinite.copies, 7);
  assert.equal(infinite.domain, null);
  assert.match(infinite.body, /InfinitePay/);

  const juju = ads.find((a) => a.advertiser === "Juju Salimeni")!;
  assert.equal(juju.domain, "constlivre.com.br");
  assert.equal(ads.find((a) => a.libraryId === "2003")!.startDate, "2026-10-19");
});

test("chave da oferta junta páginas diferentes do mesmo site", () => {
  assert.equal(offerKeyFor({ domain: "constlivre.com.br", advertiser: "X" }), "d:constlivre.com.br");
  assert.equal(offerKeyFor({ domain: "pilates.laystrancoso.com", advertiser: "X" }), "d:laystrancoso.com");
  assert.equal(offerKeyFor({ domain: "api.whatsapp.com", advertiser: "Chef Helena" }), "a:chef helena");
  assert.equal(offerKeyFor({ domain: null, advertiser: "Lays  Sant'Anna" }), "a:lays sant'anna");
});

test("agrupa ofertas, soma cópias e ignora marketplaces", () => {
  const r = parseMetaLibraryText(sample);
  const ads = mergeAds([{ keyword: "frete grátis", totalResults: r.total, ads: r.ads }], new Set(["shopee", "infinitepay"]));
  assert.equal(ads.length, 4);
  const snaps = buildSnapshots(ads);
  const cl = snaps.find((s) => s.offerKey === "d:constlivre.com.br")!;
  assert.equal(cl.cards, 2);
  assert.equal(cl.copies, 16);
  assert.equal(cl.pages, 2);
  assert.deepEqual(cl.advertisers, ["ConstLivre", "Juju Salimeni"]);
  assert.equal(cl.oldestStart, "2026-07-20");
  assert.equal(snaps[0].offerKey, "d:constlivre.com.br");
});

test("mesmo anúncio em duas buscas conta uma vez só", () => {
  const r = parseMetaLibraryText(sample);
  const ads = mergeAds(
    [
      { keyword: "a", totalResults: null, ads: r.ads },
      { keyword: "b", totalResults: null, ads: r.ads },
    ],
    new Set(),
  );
  assert.equal(ads.length, 6);
  assert.deepEqual(ads[0].keywords, ["a", "b"]);
});

test("contagem do Google", () => {
  assert.equal(parseGoogleCount("constlivre.com.br\n~300 ads\nAny time"), 300);
  assert.equal(parseGoogleCount("x\n27 ads\n"), 27);
  assert.equal(parseGoogleCount("x\n1 ad\n"), 1);
  assert.equal(parseGoogleCount("~1,200 ads"), 1200);
  assert.equal(parseGoogleCount("We didn't find any ads"), 0);
  assert.equal(parseGoogleCount("carregando..."), null);
});

test("ranking do Reclame Aqui", () => {
  const text = "Top 20\n1º\nLunna Cosméticos\nNão Recomendada\n320\nreclamações\n2º\nDELGADO INTERMEDIAÇÕES\nÓtima\n1.223\nreclamações\n";
  const rows = parseRaRanking(text, ["lunna-cosmeticos", "delgado-intermediacoes"]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { position: 1, name: "Lunna Cosméticos", reputation: "Não Recomendada", complaints: 320, slug: "lunna-cosmeticos" });
  assert.equal(rows[1].complaints, 1223);
});

test("ranking do Reclame Aqui com variações de layout", () => {
  const text = [
    "Top 20 · cadastradas há até 60 dias", "Posição e empresa", "Reclamações",
    "1º", "Lunna Cosméticos", "Não Recomendada", "320", "reclamações",
    "2º", "Reel Short", "186", "reclamações",                       // sem reputação
    "3º", "Coraluz", "C", "Não Recomendada", "150", "reclamações",  // com inicial do logo
    "4º", "Quebrado", "sem número",                                 // incompleto: ignora
    "5º", "Italihaus", "Não Recomendada", "86", "reclamações",
  ].join("\n");
  const rows = parseRaRanking(text);
  assert.deepEqual(rows.map((r) => [r.position, r.name, r.complaints]), [
    [1, "Lunna Cosméticos", 320], [2, "Reel Short", 186], [3, "Coraluz", 150], [5, "Italihaus", 86],
  ]);
  assert.equal(rows[1].reputation, null);
});

test("limpa o link de destino e a página do Facebook", async () => {
  const { cleanLandingUrl, cleanPageUrl, hostOf } = await import("../src/parse/links.js");
  const wrapped = "https://l.facebook.com/l.php?u=" + encodeURIComponent("https://menoaliv.com.br/products/meno-aliv-tratamento-30-dias?utm_content=Facebook_UA&utm_source=facebook&variant=4988108229866&fbclid=abc") + "&h=AUAz";
  assert.equal(cleanLandingUrl(wrapped), "https://menoaliv.com.br/products/meno-aliv-tratamento-30-dias?variant=4988108229866");
  assert.equal(cleanLandingUrl("https://l.facebook.com/l.php?u=" + encodeURIComponent("https://constlivre.com.br/") + "&h=x"), "https://constlivre.com.br/");
  assert.equal(cleanLandingUrl("https://www.facebook.com/somepage/"), null);
  assert.equal(cleanLandingUrl("javascript:alert(1)"), null);
  assert.equal(cleanLandingUrl(null), null);
  assert.equal(cleanPageUrl("https://www.facebook.com/61558675869659/"), "https://www.facebook.com/61558675869659/");
  assert.equal(cleanPageUrl("https://www.facebook.com/jujusalimeni/?ref=x"), "https://www.facebook.com/jujusalimeni/");
  assert.equal(cleanPageUrl("https://www.facebook.com/ads/library/?id=1"), null);
  assert.equal(hostOf("https://www.denavita.com.br/products/x"), "denavita.com.br");
});

test("a foto da oferta leva o link de destino, a página e a imagem", () => {
  const base = { advertiser: "ConstLivre", domain: "constlivre.com.br", body: "x", startDate: "2026-07-20" };
  const ads = mergeAds([{ keyword: "k", totalResults: null, ads: [
    { ...base, libraryId: "1", copies: 2, landingUrl: null, pageUrl: "https://www.facebook.com/a/", thumbUrl: "https://img/1" },
    { ...base, libraryId: "2", copies: 9, landingUrl: "https://constlivre.com.br/", pageUrl: "https://www.facebook.com/a/", thumbUrl: "https://img/2" },
  ] }], new Set());
  const [s] = buildSnapshots(ads);
  assert.equal(s.landingUrl, "https://constlivre.com.br/");
  assert.equal(s.pageUrl, "https://www.facebook.com/a/");
  assert.equal(s.thumbUrl, "https://img/2");
});

test("recusa a chave pública do Supabase", async () => {
  const { assertServiceKey } = await import("../src/db.js");
  assert.throws(() => assertServiceKey("sb_publishable_abc"), /PÚBLICA/);
  const jwt = (role: string) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".x";
  assert.throws(() => assertServiceKey(jwt("anon")), /PÚBLICA/);
  assert.doesNotThrow(() => assertServiceKey(jwt("service_role")));
  assert.doesNotThrow(() => assertServiceKey("sb_secret_abc"));
});

test("ignora marcas por nome, parceria 'com' e domínio", async () => {
  const { isIgnored } = await import("../src/aggregate.js");
  const ign = new Set(["shopee", "l'oréal paris", "hypera.com.br"]);
  assert.equal(isIgnored({ advertiser: "Shopee", domain: null }, ign), true);
  assert.equal(isIgnored({ advertiser: "Taís Araujo com L'Oréal Paris", domain: null }, ign), true);
  assert.equal(isIgnored({ advertiser: "Buscofem", domain: "www.hypera.com.br" }, ign), true);
  assert.equal(isIgnored({ advertiser: "Buscofem", domain: "hypera.com.br" }, ign), true);
  assert.equal(isIgnored({ advertiser: "ConstLivre", domain: "constlivre.com.br" }, ign), false);
  assert.equal(isIgnored({ advertiser: "Comer Sem Culpa 1.0", domain: null }, ign), false);
});
