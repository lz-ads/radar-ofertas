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

const FLAGS: Record<string, string> = { us: "🇺🇸", gb: "🇬🇧", pt: "🇵🇹", jp: "🇯🇵", es: "🇪🇸", mx: "🇲🇽", ca: "🇨🇦", au: "🇦🇺", de: "🇩🇪", fr: "🇫🇷", it: "🇮🇹" };
/** Bandeira para ofertas de fora do Brasil ("us:d:loja.com" -> "🇺🇸 "). */
export const flagOf = (key: string) => {
  const m = key.match(/^([a-z]{2}):[ad]:/);
  return m ? `${FLAGS[m[1]] ?? m[1].toUpperCase()} ` : "";
};

const link = (key: string) => `${panelUrl()}/oferta/${encodeURIComponent(key)}`;

export function formatAlerts(alerts: Alert[]): string {
  const lines = alerts.slice(0, 12).map((a) => {
    const r = a.row;
    const head = a.kind === "disparo" ? `🔥 ${flagOf(r.offer_key)}<b>${esc(r.advertiser)}</b> +${r.copies_growth} cópias na semana (${r.copies} no total)` : `🆕 ${flagOf(r.offer_key)}<b>${esc(r.advertiser)}</b> entrou no top 20 (score ${r.score})`;
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

export interface WatchNews {
  key: string;
  label: string;
  newAds: number;
}

/** Espionagem: criativos novos de quem você segue. */
export function formatWatch(items: WatchNews[]): string {
  const lines = items.slice(0, 12).map((w) => `🕵️ <b>${esc(w.label)}</b> soltou ${w.newAds} ${w.newAds === 1 ? "criativo novo" : "criativos novos"}\n<a href="${link(w.key)}">ver no radar</a>`);
  return `📡 <b>Espionagem</b>\n\n${lines.join("\n\n")}`;
}

export interface CoolingRow {
  offer_key: string;
  advertiser: string;
  copies: number;
  copies_7d: number | null;
  status: string | null;
}

/** Oferta do seu funil perdendo força (cópias caindo forte na semana). */
export function formatCooling(rows: CoolingRow[]): string {
  const lines = rows.slice(0, 10).map(
    (r) => `🧊 <b>${esc(r.advertiser)}</b> esfriando: ${r.copies_7d ?? "?"} → ${r.copies} cópias em 7 dias${r.status ? ` (no seu funil: ${esc(r.status)})` : ""}\n<a href="${link(r.offer_key)}">ver no radar</a>`,
  );
  return `📡 <b>Atenção no funil</b>\n\n${lines.join("\n\n")}`;
}
