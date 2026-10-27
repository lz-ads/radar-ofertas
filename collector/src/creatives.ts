import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const BUCKET = "criativos";

/** Reduz a imagem do criativo para webp leve (~15 KB): cabe milhares no plano grátis do Supabase. */
export async function toThumb(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: 360, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
}

/**
 * Baixa as imagens dos anúncios (o link do Facebook expira em poucos dias) e guarda no Storage.
 * Devolve quantos foram salvos.
 */
export async function storeCreatives(
  db: SupabaseClient,
  items: { libraryId: string; thumbUrl: string }[],
  doFetch: typeof fetch = fetch,
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const res = await doFetch(it.thumbUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const webp = await toThumb(Buffer.from(await res.arrayBuffer()));
      const path = `ads/${it.libraryId}.webp`;
      const up = await db.storage.from(BUCKET).upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      const upd = await db.from("ads").update({ thumb_path: path }).eq("library_id", it.libraryId);
      if (upd.error) throw new Error(upd.error.message);
      saved++;
    } catch (e) {
      failed++;
      if (failed <= 3) console.warn(`[criativos] ${it.libraryId}:`, (e as Error).message);
    }
  }
  return { saved, failed };
}
