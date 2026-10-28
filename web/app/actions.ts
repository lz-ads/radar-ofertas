"use server";

import { revalidatePath } from "next/cache";
import { countryOfKey, db, STATUSES, validKey } from "@/lib/db";
import { geminiText } from "@/lib/gemini";
import { myVersionPrompt, type MyInput } from "@/lib/kit";

const refresh = (key: string) => {
  revalidatePath("/");
  revalidatePath("/funil");
  revalidatePath("/espionagem");
  revalidatePath(`/oferta/${encodeURIComponent(key)}`);
};

/** Muda o status da oferta no funil ("" tira do funil). */
export async function setStatus(form: FormData) {
  const key = String(form.get("key") ?? "");
  const status = String(form.get("status") ?? "");
  if (!validKey(key)) return;
  if (status && !(STATUSES as readonly string[]).includes(status)) return;
  const client = db();
  if (!status) {
    // sem status e sem nota: some do funil
    const { data } = await client.from("offer_notes").select("note").eq("offer_key", key).maybeSingle();
    if (!(data as { note?: string | null } | null)?.note) await client.from("offer_notes").delete().eq("offer_key", key);
    else await client.from("offer_notes").update({ status: null, updated_at: new Date().toISOString() }).eq("offer_key", key);
  } else {
    await client.from("offer_notes").upsert({ offer_key: key, status, updated_at: new Date().toISOString() }, { onConflict: "offer_key" });
  }
  refresh(key);
}

/** Estrela do ranking: favorita / tira dos favoritos (não mexe em quem já está mais adiante no funil). */
export async function toggleFavorite(form: FormData) {
  const key = String(form.get("key") ?? "");
  const current = String(form.get("current") ?? "");
  if (!validKey(key)) return;
  const next = new FormData();
  next.set("key", key);
  next.set("status", current === "favorita" ? "" : current || "favorita");
  if (current && current !== "favorita") return; // já está no funil em outra etapa
  await setStatus(next);
}

export async function saveNote(form: FormData) {
  const key = String(form.get("key") ?? "");
  const note = String(form.get("note") ?? "").slice(0, 4000);
  if (!validKey(key)) return;
  await db().from("offer_notes").upsert({ offer_key: key, note: note || null, updated_at: new Date().toISOString() }, { onConflict: "offer_key" });
  refresh(key);
}

/** Liga/desliga a espionagem de uma oferta: o robô busca o site (ou o nome) a cada coleta. */
export async function toggleWatch(form: FormData) {
  const key = String(form.get("key") ?? "");
  if (!validKey(key)) return;
  const client = db();
  const { data: existing } = await client.from("watchlist").select("id").eq("offer_key", key).limit(1);
  if (existing?.length) {
    await client.from("watchlist").delete().eq("offer_key", key);
  } else {
    const { data: o } = await client.from("offer_ranking").select("advertiser, domain").eq("offer_key", key).maybeSingle();
    const row = o as { advertiser: string; domain: string | null } | null;
    if (!row) return;
    const term = (row.domain ?? row.advertiser).toLowerCase().slice(0, 120);
    await client.from("watchlist").upsert(
      { offer_key: key, label: row.advertiser, term, country: countryOfKey(key) },
      { onConflict: "term,country" },
    );
  }
  refresh(key);
}

/** Adiciona à espionagem pelo site ou nome da página (liga à oferta quando ela aparecer). */
export async function addWatch(form: FormData) {
  const term = String(form.get("term") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").slice(0, 120);
  const country = String(form.get("country") ?? "BR").toUpperCase();
  if (!term || !/^[A-Z]{2}$/.test(country)) return;
  await db().from("watchlist").upsert({ label: term, term, country }, { onConflict: "term,country" });
  revalidatePath("/espionagem");
}

export async function removeWatch(form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isFinite(id)) return;
  await db().from("watchlist").delete().eq("id", id);
  revalidatePath("/espionagem");
  revalidatePath("/");
}

export type MyVersionState = { ok: boolean; message: string };

/** Kit de modelagem: a IA escreve a SUA versão (página, ganchos, roteiros) a partir da estrutura da oferta. */
export async function generateMyVersion(_prev: MyVersionState, form: FormData): Promise<MyVersionState> {
  const key = String(form.get("key") ?? "");
  if (!validKey(key)) return { ok: false, message: "Oferta inválida." };
  const input: MyInput = {
    produto: String(form.get("produto") ?? "").trim().slice(0, 300),
    preco: String(form.get("preco") ?? "").trim().slice(0, 120),
    diferencial: String(form.get("diferencial") ?? "").trim().slice(0, 600),
    publico: String(form.get("publico") ?? "").trim().slice(0, 300),
    idioma: String(form.get("idioma") ?? "português do Brasil").trim().slice(0, 40),
    marca: String(form.get("marca") ?? "").trim().slice(0, 80),
  };
  if (!input.produto) return { ok: false, message: "Escreva qual é o seu produto." };
  const client = db();
  const [{ data: kit }, { data: offer }, { data: ads }] = await Promise.all([
    client.from("offer_kits").select("structure").eq("offer_key", key).maybeSingle(),
    client.from("offer_ranking").select("advertiser, promise, mechanism, offer, audience").eq("offer_key", key).maybeSingle(),
    client.from("ads").select("library_id, body, copies").eq("offer_key", key).order("copies", { ascending: false }).limit(5),
  ]);
  const ids = ((ads ?? []) as { library_id: string }[]).map((a) => a.library_id);
  const { data: trs } = ids.length ? await client.from("ad_transcripts").select("hook, structure, cta").in("library_id", ids) : { data: [] };
  try {
    const prompt = myVersionPrompt({
      input,
      structure: (kit as { structure: unknown } | null)?.structure ?? null,
      offer: offer as Record<string, string | null> | null,
      adTexts: ((ads ?? []) as { body: string | null }[]).map((a) => a.body ?? "").filter(Boolean),
      transcripts: (trs ?? []) as { hook: string | null; structure: string | null; cta: string | null }[],
    });
    const r = await geminiText(prompt);
    await client.from("offer_kits").upsert(
      { offer_key: key, my_input: input, my_version: r.text.slice(0, 40_000), my_model: r.model, my_updated_at: new Date().toISOString() },
      { onConflict: "offer_key" },
    );
    revalidatePath(`/oferta/${encodeURIComponent(key)}`);
    return { ok: true, message: `Pronto (${r.model}).` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
