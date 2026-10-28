import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket com o arquivo original (vídeo mp4 ou imagem) para baixar em 1 clique. */
export const MEDIA_BUCKET = "midia";
/** Limite por arquivo do plano grátis do Supabase (50 MB), com folga. */
export const MAX_FILE = 45 * 1024 * 1024;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export interface MediaItem {
  libraryId: string;
  url: string;
  kind: "video" | "image";
}

/** Extensão e tipo do arquivo a partir do cabeçalho (o Facebook manda jpg, png, webp ou mp4). */
export function fileTypeFor(kind: "video" | "image", contentType: string | null): { ext: string; type: string } {
  if (kind === "video") return { ext: "mp4", type: "video/mp4" };
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return { ext: "png", type: "image/png" };
  if (ct.includes("webp")) return { ext: "webp", type: "image/webp" };
  return { ext: "jpg", type: "image/jpeg" };
}

/**
 * Baixa o vídeo/imagem original de cada anúncio (o link do Facebook expira em poucos dias)
 * e guarda no Storage. Arquivos acima de 45 MB ficam de fora.
 */
export async function storeMedia(
  db: SupabaseClient,
  items: MediaItem[],
  doFetch: typeof fetch = fetch,
): Promise<{ saved: number; failed: number; skipped: number; bytes: number }> {
  let saved = 0, failed = 0, skipped = 0, bytes = 0;
  for (const it of items) {
    try {
      const res = await doFetch(it.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared > MAX_FILE) {
        skipped++;
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_FILE) {
        skipped++;
        continue;
      }
      if (buf.length < 1000) throw new Error("arquivo vazio");
      const { ext, type } = fileTypeFor(it.kind, res.headers.get("content-type"));
      const path = `ads/${it.libraryId}.${ext}`;
      const up = await db.storage.from(MEDIA_BUCKET).upload(path, buf, { contentType: type, upsert: true, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      const upd = await db.from("ads").update({ media_path: path, media_bytes: buf.length }).eq("library_id", it.libraryId);
      if (upd.error) throw new Error(upd.error.message);
      saved++;
      bytes += buf.length;
    } catch (e) {
      failed++;
      if (failed <= 3) console.warn(`[midia] ${it.libraryId}:`, (e as Error).message);
    }
  }
  return { saved, failed, skipped, bytes };
}

/**
 * Mantém o bucket dentro do orçamento: apaga primeiro os arquivos de ofertas que saíram da lista
 * de prioridade, dos vistos há mais tempo para os mais recentes.
 */
export async function pruneMedia(db: SupabaseClient, budgetBytes: number, keep: Set<string>): Promise<number> {
  const rows: { library_id: string; offer_key: string; media_path: string; media_bytes: number | null; last_seen: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await db.from("ads").select("library_id, offer_key, media_path, media_bytes, last_seen")
      .not("media_path", "is", null).order("last_seen", { ascending: true }).range(from, from + 999);
    if (res.error) throw new Error(`ads (mídia): ${res.error.message}`);
    rows.push(...(res.data ?? []));
    if ((res.data ?? []).length < 1000) break;
  }
  let total = rows.reduce((s, r) => s + (r.media_bytes ?? 0), 0);
  if (total <= budgetBytes) return 0;
  const victims = [...rows.filter((r) => !keep.has(r.offer_key)), ...rows.filter((r) => keep.has(r.offer_key))];
  const drop: typeof rows = [];
  for (const v of victims) {
    if (total <= budgetBytes) break;
    drop.push(v);
    total -= v.media_bytes ?? 0;
  }
  for (let i = 0; i < drop.length; i += 100) {
    const chunk = drop.slice(i, i + 100);
    await db.storage.from(MEDIA_BUCKET).remove(chunk.map((d) => d.media_path));
    await db.from("ads").update({ media_path: null, media_bytes: null }).in("library_id", chunk.map((d) => d.library_id));
  }
  return drop.length;
}
