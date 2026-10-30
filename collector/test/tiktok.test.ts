import { strict as assert } from "node:assert";
import { test } from "node:test";
import { collectIndustryNames, libraryTerm, libraryUrl, parseLibrary, parseTopAds, pickVideo, TIKTOK_LIBRARY_COUNTRIES } from "../src/sources/tiktok.js";

// formato real visto na Central de Criativos (30/10/2026), encurtado
const LIST = {
  code: 0,
  msg: "OK",
  data: {
    materials: [
      {
        ad_title: "Transforme sua rotina com um caldo de ossos feito de verdade. Conheça!", brand_name: "", cost: 0, ctr: 0.67, favorite: false,
        id: "7689472689073586196", industry_key: "label_27101000000", is_search: true, like: 10, objective_key: "campaign_objective_conversion",
        video_info: { vid: "v1", duration: 29.2, cover: "https://p16.tiktokcdn.com/c.jpg", video_url: { "1080p": "https://v/1080.mp4", "540p": "https://v/540.mp4" }, width: 720, height: 1280 },
      },
      { ad_title: "Score every Point !", brand_name: "Nike", ctr: 0.93, id: "7686820729639895061", industry_key: "label_20109000000", like: 0, objective_key: "campaign_objective_traffic", video_info: {} },
    ],
    pagination: { has_more: true, page: 2, size: 20, total_count: 122 },
  },
};

test("tiktok: lê a lista de Top Ads", () => {
  const r = parseTopAds(LIST, "BR", 20);
  assert.equal(r.total, 122);
  assert.equal(r.hasMore, true);
  assert.equal(r.ads.length, 2);
  assert.deepEqual(
    { id: r.ads[0].id, likes: r.ads[0].likes, ctr: r.ads[0].ctr, objective: r.ads[0].objective, video: r.ads[0].videoUrl, rank: r.ads[0].rank, brand: r.ads[0].brandName },
    { id: "7689472689073586196", likes: 10, ctr: 0.67, objective: "conversões", video: "https://v/540.mp4", rank: 21, brand: null },
  );
  assert.equal(r.ads[1].brandName, "Nike");
  assert.equal(r.ads[1].videoUrl, null);
  assert.deepEqual(parseTopAds({ code: 40101 }, "BR"), { ads: [], hasMore: false, total: null });
});

test("tiktok: vídeo prefere qualidade média", () => {
  assert.equal(pickVideo({ "1080p": "a", "720p": "b" }), "b");
  assert.equal(pickVideo({ "360p": "x" }), "x");
  assert.equal(pickVideo(undefined), null);
});

test("tiktok: acha os nomes dos setores em qualquer formato", () => {
  const m = collectIndustryNames({ data: { industry: [{ id: "label_27101000000", label: "Alimentos" }, { value: "label_20109000000", name: "Esportes", children: [{ key: "label_1", text: "Futebol" }] }] } });
  assert.equal(m.get("label_27101000000"), "Alimentos");
  assert.equal(m.get("label_20109000000"), "Esportes");
  assert.equal(m.get("label_1"), "Futebol");
});

// formato real da biblioteca (library.tiktok.com/api/v1/search), encurtado
const LIB = {
  code: 0, total: 2179, has_more: true, search_id: "x",
  data: [
    { id: "1880333310201858", name: "charley_gym3", first_shown_date: 1793145600000, last_shown_date: 1793145600000, videos: [{ video_url: "https://v.mp4", cover_img: "https://c.jpg" }], estimated_audience: "0-1K", image_urls: [], title: "bulk time #gym" },
    { id: "2", name: "GYMSHARK LTD", first_shown_date: 1790726400000, last_shown_date: 1793145600000, videos: [], image_urls: ["https://img.jpg"], estimated_audience: "1K-10K", title: "" },
  ],
};

test("tiktok: lê a biblioteca europeia", () => {
  const r = parseLibrary(LIB);
  assert.equal(r.total, 2179);
  assert.equal(r.ads[0].firstShown, "2026-10-28");
  assert.equal(r.ads[0].coverUrl, "https://c.jpg");
  assert.equal(r.ads[1].coverUrl, "https://img.jpg");
  assert.equal(r.ads[1].videoUrl, null);
  assert.equal(r.ads[1].audience, "1K-10K");
});

test("tiktok: termo e endereço da biblioteca", () => {
  assert.equal(libraryTerm("gymshark.com", "Gymshark"), "gymshark");
  assert.equal(libraryTerm("loja.com.br", "Loja"), "loja");
  assert.equal(libraryTerm("help global", "Help Global Brazil"), "Help Global Brazil");
  const u = new URL(libraryUrl("gymshark", "GB", 1793335736304));
  assert.equal(u.searchParams.get("region"), "GB");
  assert.equal(u.searchParams.get("adv_name"), "gymshark");
  assert.equal(Number(u.searchParams.get("end_time")) - Number(u.searchParams.get("start_time")), 30 * 864e5);
  assert.ok(TIKTOK_LIBRARY_COUNTRIES.has("PT") && TIKTOK_LIBRARY_COUNTRIES.has("GB") && !TIKTOK_LIBRARY_COUNTRIES.has("BR"));
});

test("chave da oferta: sufixos de dois níveis de outros países", async () => {
  const { offerKeyFor } = await import("../src/parse/meta.js");
  const k = (domain: string) => offerKeyFor({ domain, advertiser: "x" });
  assert.equal(k("shop.theessencevault.co.uk"), "d:theessencevault.co.uk");
  assert.equal(k("theessencevault.co.uk"), "d:theessencevault.co.uk");
  assert.equal(k("kireilab.co.jp"), "d:kireilab.co.jp");
  assert.equal(k("loja.com.pt"), "d:loja.com.pt");
  assert.equal(k("store.com.au"), "d:store.com.au");
  assert.equal(k("pilates.laystrancoso.com"), "d:laystrancoso.com");
  assert.equal(k("checkout.loja.com.br"), "d:loja.com.br");
});
