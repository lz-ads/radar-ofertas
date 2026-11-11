import { strict as assert } from "node:assert";
import { test } from "node:test";
import { brandOf, buildOutcome, matchesSite, nicheTerms, rootOf, siteOf } from "../src/pesquisa.js";
import { metaLibraryUrl } from "../src/sources/metaBrowser.js";
import type { MetaAd } from "../src/types.js";

const ad = (o: Partial<MetaAd> & { libraryId: string; advertiser: string }): MetaAd => ({
  domain: null, body: "texto", startDate: "2026-10-01", copies: 1, ...o,
});

test("pesquisa: reconhece site e limpa o endereço", () => {
  assert.equal(siteOf("loja.com.br"), "loja.com.br");
  assert.equal(siteOf("https://www.Loja.com.br/produto?x=1"), "loja.com.br");
  assert.equal(siteOf("pilates.laystrancoso.com/"), "pilates.laystrancoso.com");
  assert.equal(siteOf("pagamento na entrega"), null);
  assert.equal(siteOf("colágeno"), null);
  assert.equal(siteOf("2.5"), null);
});

test("pesquisa: raiz e marca do domínio", () => {
  assert.equal(rootOf("pilates.laystrancoso.com"), "laystrancoso.com");
  assert.equal(rootOf("loja.com.br"), "loja.com.br");
  assert.equal(brandOf("loja.com.br"), "loja");
  assert.equal(brandOf("abc.com"), null); // curto demais: traria lixo
});

test("pesquisa: anúncio leva ao site (domínio do card ou link de destino, com subdomínio)", () => {
  assert.equal(matchesSite({ domain: "LOJA.COM.BR", landingUrl: null }, "loja.com.br"), true);
  assert.equal(matchesSite({ domain: null, landingUrl: "https://checkout.loja.com.br/p/1" }, "loja.com.br"), true);
  assert.equal(matchesSite({ domain: "pilates.laystrancoso.com", landingUrl: null }, "laystrancoso.com"), true);
  assert.equal(matchesSite({ domain: "outraloja.com.br", landingUrl: null }, "loja.com.br"), false);
});

test("pesquisa: agrupa por oferta com país, não aplica ignorados e põe quem leva ao site primeiro", () => {
  const out = buildOutcome(
    [{ keyword: "loja.com.br", totalResults: null, ads: [
      ad({ libraryId: "1", advertiser: "Blog de Ofertas", domain: "blog.com", body: "vi na loja.com.br" }),
      ad({ libraryId: "2", advertiser: "Loja", domain: "loja.com.br", copies: 4 }),
      ad({ libraryId: "3", advertiser: "Loja" }),
    ] }],
    "US",
    "loja.com.br",
  );
  assert.deepEqual(out.map((a) => [a.libraryId, a.siteMatch]), [["2", true], ["1", false], ["3", false]]);
  assert.equal(out[0].offerKey, "us:d:loja.com.br");
  // anúncio sem site do mesmo anunciante entra na oferta do site
  assert.equal(out.find((a) => a.libraryId === "3")?.offerKey, "us:d:loja.com.br");
  assert.equal(out.find((a) => a.libraryId === "1")?.siteMatch, false);
});

test("pesquisa: busca de palavra no Brasil não marca site e mantém a ordem da Meta", () => {
  const out = buildOutcome(
    [{ keyword: "frete grátis", totalResults: "~1.000 resultados", ads: [
      ad({ libraryId: "9", advertiser: "B", domain: "b.com.br" }),
      ad({ libraryId: "8", advertiser: "A", domain: "a.com.br" }),
    ] }],
    "BR",
    null,
  );
  assert.deepEqual(out.map((a) => a.libraryId), ["9", "8"]);
  assert.equal(out[0].offerKey, "d:b.com.br");
  assert.equal(out[0].siteMatch, null);
});

test("pesquisa: link da Meta com frase exata ou qualquer palavra", () => {
  assert.match(metaLibraryUrl("frete grátis", "BR"), /search_type=keyword_exact_phrase/);
  assert.match(metaLibraryUrl("frete grátis", "BR"), /q=%22frete%20gr%C3%A1tis%22/);
  const any = metaLibraryUrl("frete grátis", "US", "any");
  assert.match(any, /search_type=keyword_unordered/);
  assert.match(any, /country=US/);
  assert.doesNotMatch(any, /%22/);
});

test("nicho: limpa as palavras (minúsculas, sem aspas, sem repetidas, até o limite)", () => {
  assert.deepEqual(nicheTerms(['"Rodadas Grátis"', "rodadas  grátis", "", "x", "Cassino Online", "bônus"], "bet", 3), ["rodadas grátis", "cassino online", "bônus"]);
  // sem lista: usa o nome do nicho
  assert.deepEqual(nicheTerms(null, "Cassino Online"), ["cassino online"]);
  assert.deepEqual(nicheTerms(["", "  "], "bet"), ["bet"]);
});

test("nicho: junta as palavras, marca em quais o anúncio apareceu e agrupa por anunciante", () => {
  const out = buildOutcome(
    [
      { keyword: "rodadas grátis", totalResults: "~3.000 resultados", ads: [
        ad({ libraryId: "1", advertiser: "Bet A", domain: "beta.bet.br", copies: 5 }),
        ad({ libraryId: "2", advertiser: "Cassino B", domain: "cassinob.bet.br" }),
      ] },
      { keyword: "cassino online", totalResults: "~9.000 resultados", ads: [
        ad({ libraryId: "1", advertiser: "Bet A", domain: "beta.bet.br", copies: 7 }),
        ad({ libraryId: "3", advertiser: "Bet A", domain: "beta.bet.br" }),
      ] },
    ],
    "BR",
    null,
  );
  assert.deepEqual(out.map((a) => a.libraryId), ["1", "2", "3"]);
  const first = out.find((a) => a.libraryId === "1")!;
  assert.deepEqual(first.keywords, ["rodadas grátis", "cassino online"]);
  assert.equal(first.copies, 7);
  assert.equal(new Set(out.filter((a) => a.advertiser === "Bet A").map((a) => a.offerKey)).size, 1);
});
