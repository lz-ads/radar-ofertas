"use server";

import { revalidatePath } from "next/cache";
import { db, STATUSES } from "@/lib/db";

const validKey = (k: string) => /^[ad]:[^\s]{1,200}$/.test(k);

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
  revalidatePath("/");
  revalidatePath("/funil");
  revalidatePath(`/oferta/${encodeURIComponent(key)}`);
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
  revalidatePath("/funil");
  revalidatePath(`/oferta/${encodeURIComponent(key)}`);
}
