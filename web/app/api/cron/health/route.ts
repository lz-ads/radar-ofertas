import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Vigia independente do GitHub: a Vercel chama esta rota 1x por dia (vercel.json).
 * Se a coleta da Meta não tem sucesso há mais de 26 h (robô parado, GitHub desligou o agendamento,
 * Meta bloqueando), avisa no Telegram.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Defina CRON_SECRET nas variáveis da Vercel para ligar o vigia.", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("não autorizado", { status: 401 });

  const { data } = await db().from("runs").select("finished_at").eq("source", "meta").eq("ok", true).order("id", { ascending: false }).limit(1);
  const last = (data?.[0] as { finished_at: string } | undefined)?.finished_at ?? null;
  const hours = last ? (Date.now() - Date.parse(last)) / 36e5 : Infinity;
  const healthy = hours <= 26;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  let notified = false;
  if (!healthy && token && chat) {
    const site = process.env.PANEL_URL || `https://${req.headers.get("host")}`;
    const text = `⚠️ <b>Radar parado</b>\nA última coleta da Meta com sucesso foi ${last ? `há ${Math.round(hours)} horas` : "nunca"}.\nConfira o GitHub Actions (o agendamento pode ter sido desligado) e a <a href="${site}/status">página de status</a>.`;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    notified = res.ok;
  }
  return Response.json({ healthy, lastSuccess: last, hours: Number.isFinite(hours) ? Math.round(hours) : null, notified });
}
