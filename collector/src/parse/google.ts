/**
 * Lê a contagem de anúncios do Centro de Transparência do Google
 * (página em inglês: "~300 ads", "27 ads", "1 ad"). Retorna 0 quando a página
 * diz que não há anúncios e null quando não deu para ler.
 */
export function parseGoogleCount(text: string): number | null {
  if (/no ads|didn't find any ads|nenhum anúncio/i.test(text)) return 0;
  const m = text.match(/~?([\d,.]+)\s*(K)?\s+ads?\b/i) || text.match(/~?([\d,.]+)\s*(mil)?\s+anúncios?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/[,.]/g, ""));
  if (m[2]) n = n * 1000;
  return Number.isFinite(n) ? n : null;
}
