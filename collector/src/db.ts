import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdWithMeta } from "./aggregate.js";
import type { OfferSnapshot, RaCompany } from "./types.js";

export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Data de hoje no fuso de São Paulo (yyyy-mm-dd). */
export function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function loadKeywords(db: SupabaseClient): Promise<string[]> {
  const data = check(await db.from("keywords").select("term").eq("active", true).order("id"), "keywords");
  return (data ?? []).map((r: { term: string }) => r.term);
}

export async function loadIgnored(db: SupabaseClient): Promise<Set<string>> {
  const data = check(await db.from("ignored_advertisers").select("name"), "ignored_advertisers");
  return new Set((data ?? []).map((r: { name: string }) => r.name.toLowerCase()));
}

export async function saveAds(db: SupabaseClient, ads: AdWithMeta[]) {
  const now = new Date().toISOString();
  await inChunks(ads, 500, async (chunk) => {
    check(
      await db.from("ads").upsert(
        chunk.map((a) => ({
          library_id: a.libraryId,
          offer_key: a.offerKey,
          advertiser: a.advertiser,
          domain: a.domain,
          body: a.body,
          start_date: a.startDate,
          copies: a.copies,
          keywords: a.keywords,
          last_seen: now,
        })),
        { onConflict: "library_id" },
      ),
      "ads",
    );
  });
}

export async function saveSnapshots(db: SupabaseClient, day: string, snaps: OfferSnapshot[]) {
  await inChunks(snaps, 500, async (chunk) => {
    check(
      await db.from("offer_snapshots").upsert(
        chunk.map((s) => ({
          day,
          offer_key: s.offerKey,
          advertiser: s.advertiser,
          advertisers: s.advertisers,
          domain: s.domain,
          cards: s.cards,
          copies: s.copies,
          pages: s.pages,
          oldest_start: s.oldestStart,
          keywords: s.keywords,
          sample_text: s.sampleText,
        })),
        { onConflict: "day,offer_key" },
      ),
      "offer_snapshots",
    );
  });
}

/** Domínios do dia que ainda não têm contagem do Google nos últimos 7 dias. */
export async function domainsNeedingGoogle(db: SupabaseClient, day: string, limit: number): Promise<string[]> {
  const snaps = check(
    await db.from("offer_snapshots").select("domain, copies, cards").eq("day", day).not("domain", "is", null)
      .order("copies", { ascending: false }).limit(limit * 3),
    "snapshots",
  ) as { domain: string }[];
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const recent = check(await db.from("google_counts").select("domain").gte("day", since), "google_counts") as { domain: string }[];
  const done = new Set(recent.map((r) => r.domain));
  return [...new Set(snaps.map((s) => s.domain))].filter((d) => !done.has(d)).slice(0, limit);
}

export async function saveGoogleCount(db: SupabaseClient, day: string, domain: string, ads: number) {
  check(await db.from("google_counts").upsert({ domain, day, ads }, { onConflict: "domain,day" }), "google_counts");
}

export async function raAlreadyToday(db: SupabaseClient, day: string): Promise<boolean> {
  const res = await db.from("ra_new_companies").select("name", { count: "exact", head: true }).eq("day", day);
  return (res.count ?? 0) > 0;
}

export async function saveRa(db: SupabaseClient, day: string, rows: RaCompany[]) {
  if (!rows.length) return;
  check(
    await db.from("ra_new_companies").upsert(
      rows.map((r) => ({ day, position: r.position, name: r.name, slug: r.slug, reputation: r.reputation, complaints: r.complaints })),
      { onConflict: "day,name" },
    ),
    "ra_new_companies",
  );
}

export async function logRun(db: SupabaseClient | null, source: string, ok: boolean, items: number, message = "") {
  if (!db) return;
  await db.from("runs").insert({ source, ok, items, message: message.slice(0, 2000), finished_at: new Date().toISOString() });
}
