import { db, keyLabel, libraryLink, priceRange, storageUrl, validKey, countryOfKey } from "@/lib/db";
import { kitMarkdown, type KitStructure, type Transcript } from "@/lib/kit";

export const dynamic = "force-dynamic";

/** Kit de modelagem completo em Markdown (abre no Notion, Docs, Obsidian ou qualquer editor). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  if (!validKey(key)) return new Response("oferta inválida", { status: 400 });
  const client = db();
  const [{ data: offer }, { data: kit }, { data: ads }] = await Promise.all([
    client.from("offer_ranking").select("*").eq("offer_key", key).maybeSingle(),
    client.from("offer_kits").select("structure, my_version").eq("offer_key", key).maybeSingle(),
    client.from("ads").select("library_id, body, copies, cta, media_path").eq("offer_key", key).order("copies", { ascending: false }).limit(30),
  ]);
  const o = offer as Record<string, unknown> | null;
  if (!o) return new Response("oferta não encontrada", { status: 404 });
  const list = (ads ?? []) as { library_id: string; body: string | null; copies: number; cta: string | null; media_path: string | null }[];
  const [{ data: page }, { data: trs }] = await Promise.all([
    o.landing_url ? client.from("landing_pages").select("shot_path, currency").eq("url", o.landing_url as string).maybeSingle() : Promise.resolve({ data: null }),
    list.length ? client.from("ad_transcripts").select("library_id, transcript, hook, structure, cta").in("library_id", list.map((a) => a.library_id)) : Promise.resolve({ data: [] }),
  ]);
  const p = page as { shot_path: string | null; currency: string | null } | null;
  const origin = new URL(req.url).origin;
  const md = kitMarkdown({
    name: String(o.advertiser),
    key,
    domain: (o.domain as string | null) ?? null,
    landing: (o.landing_url as string | null) ?? null,
    panel: `${origin}/oferta/${encodeURIComponent(key)}`,
    library: libraryLink((o.domain as string | null) ?? String(o.advertiser), countryOfKey(key)),
    prices: priceRange(o.price_min as number | null, o.price_max as number | null, p?.currency ?? "BRL"),
    platform: (o.platform as string | null) ?? null,
    checkout: (o.checkout as string | null) ?? null,
    insight: o.niche ? { audience: o.audience as string | null, promise: o.promise as string | null, mechanism: o.mechanism as string | null, offer: o.offer as string | null, risk: o.risk as string | null } : null,
    structure: ((kit as { structure: KitStructure | null } | null)?.structure ?? null),
    ads: list.map((a) => ({ library_id: a.library_id, body: a.body, copies: a.copies, cta: a.cta, media: a.media_path ? storageUrl("midia", a.media_path) : null })),
    transcripts: new Map(((trs ?? []) as (Transcript & { library_id: string })[]).map((t) => [t.library_id, t])),
    shot: p?.shot_path ? storageUrl("paginas", p.shot_path) : null,
    myVersion: (kit as { my_version: string | null } | null)?.my_version ?? null,
  });
  const file = `kit-${keyLabel(key).replace(/[^a-z0-9.]+/gi, "-")}.md`;
  return new Response(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
