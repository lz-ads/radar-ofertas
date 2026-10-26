import type { RaCompany } from "../types.js";

/** Lê o ranking "Recém-cadastradas com mais reclamações" a partir do texto da página. */
export function parseRaRanking(text: string, slugs: string[] = []): RaCompany[] {
  const re = /(\d+)º\n([^\n]+)\n([^\n]+)\n([\d.]+)\nreclamações/g;
  const out: RaCompany[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const position = Number(m[1]);
    out.push({
      position,
      name: m[2].trim(),
      reputation: m[3].trim(),
      complaints: Number(m[4].replace(/\./g, "")),
      slug: slugs[position - 1] ?? null,
    });
  }
  return out;
}
