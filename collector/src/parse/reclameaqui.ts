import type { RaCompany } from "../types.js";

/**
 * Lê o ranking "Recém-cadastradas com mais reclamações" a partir do texto da página.
 * Formato esperado por empresa (linhas): "1º", nome, [reputação], número, "reclamações".
 * A reputação pode faltar ou vir com textos extras, por isso o leitor anda linha a linha.
 */
export function parseRaRanking(text: string, slugs: string[] = []): RaCompany[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: RaCompany[] = [];
  for (let i = 0; i < lines.length; i++) {
    const pos = lines[i].match(/^(\d{1,3})º$/);
    if (!pos) continue;
    // procura "reclamações" nas próximas linhas
    let end = -1;
    for (let j = i + 2; j < Math.min(i + 8, lines.length); j++) {
      if (/^reclamações$/i.test(lines[j])) { end = j; break; }
      if (/^\d{1,3}º$/.test(lines[j])) break;
    }
    if (end < 0) continue;
    const num = lines[end - 1].match(/^([\d.]+)$/);
    if (!num) continue;
    const name = lines[i + 1];
    const between = lines.slice(i + 2, end - 1);
    const position = Number(pos[1]);
    if (out.some((r) => r.position === position)) continue;
    out.push({
      position,
      name,
      reputation: between.length ? between.join(" ") : null,
      complaints: Number(num[1].replace(/\./g, "")),
      slug: slugs[position - 1] ?? null,
    });
    i = end;
  }
  return out;
}
