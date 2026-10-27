import { esc, panelUrl } from "./telegram.js";

export interface RankRow {
  offer_key: string;
  advertiser: string;
  domain: string | null;
  score: number;
  copies: number;
  copies_7d: number | null;
  copies_growth: number;
  niche?: string | null;
}

export interface Alert {
  key: string;
  kind: "top" | "disparo";
  row: RankRow;
}

const WEEK = 7 * 864e5;

/** Disparo: cresceu 10+ cópias na semana, ou dobrou (com pelo menos 6). */
export const isSurge = (r: RankRow) =>
  r.copies_7d !== null && (r.copies_growth >= 10 || (r.copies >= 6 && r.copies >= 2 * r.copies_7d));

/**
 * Decide o que avisar: oferta nova no top 20 e oferta disparando.
 * Não repete o mesmo aviso da mesma oferta por 7 dias.
 * Na primeira vez (nada enviado ainda) só marca tudo, para não mandar 20 mensagens de uma vez.
 */
export function computeAlerts(rows: RankRow[], sent: Map<string, number>, now = Date.now()) {
  const recently = (key: string, kind: string) => {
    const t = sent.get(`${key}|${kind}`);
    return t !== undefined && now - t < WEEK;
  };
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, 20);
  const candidates: Alert[] = [
    ...rows.filter(isSurge).map((row) => ({ key: row.offer_key, kind: "disparo" as const, row })),
    ...top.map((row) => ({ key: row.offer_key, kind: "top" as const, row })),
  ];
  const firstRun = sent.size === 0;
  const fresh = candidates.filter((a) => !recently(a.key, a.kind));
  // a mesma oferta não aparece duas vezes na mesma mensagem (disparo tem prioridade)
  const seen = new Set<string>();
  const unique = fresh.filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
  return { firstRun, toSend: firstRun ? [] : unique, toMark: fresh, top };
}

const link = (key: string) => `${panelUrl()}/oferta/${encodeURIComponent(key)}`;

export function formatAlerts(alerts: Alert[]): string {
  const lines = alerts.slice(0, 12).map((a) => {
    const r = a.row;
    const head = a.kind === "disparo" ? `🔥 <b>${esc(r.advertiser)}</b> +${r.copies_growth} cópias na semana (${r.copies} no total)` : `🆕 <b>${esc(r.advertiser)}</b> entrou no top 20 (score ${r.score})`;
    const sub = [r.domain, r.niche].filter(Boolean).map((s) => esc(String(s))).join(" · ");
    return `${head}\n${sub ? sub + "\n" : ""}<a href="${link(r.offer_key)}">abrir no radar</a>`;
  });
  const more = alerts.length > 12 ? `\n\n+ ${alerts.length - 12} no painel` : "";
  return `📡 <b>Radar de Ofertas</b> · ${alerts.length} ${alerts.length === 1 ? "novidade" : "novidades"}\n\n${lines.join("\n\n")}${more}`;
}

export function formatWelcome(top: RankRow[]): string {
  const lines = top.slice(0, 5).map((r, i) => `${i + 1}. <b>${esc(r.advertiser)}</b> · score ${r.score}${r.domain ? ` · ${esc(r.domain)}` : ""}`);
  return `📡 <b>Radar de Ofertas ligado</b>\nA partir de agora aviso aqui quando uma oferta entrar no top 20 ou disparar em cópias.\n\nTop 5 de hoje:\n${lines.join("\n")}\n\n<a href="${panelUrl()}">abrir o painel</a>`;
}
