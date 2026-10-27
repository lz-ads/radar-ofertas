/** Envio de mensagens pelo Telegram (bot gratuito). Sem TELEGRAM_BOT_TOKEN/CHAT_ID, não faz nada. */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(html: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) console.warn("[telegram]", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

export const panelUrl = () => (process.env.PANEL_URL || "https://radar-ofertas-web.vercel.app").replace(/\/$/, "");
