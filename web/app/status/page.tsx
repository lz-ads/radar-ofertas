import { db } from "@/lib/db";
import { C, K, N, S, Terminal } from "../terminal";

export const dynamic = "force-dynamic";

interface Run { id: number; source: string; ok: boolean | null; items: number | null; message: string | null; finished_at: string | null }

const SOURCES: { key: string; label: string; every: string; maxAgeH: number }[] = [
  { key: "meta", label: "Biblioteca da Meta", every: "3x por dia", maxAgeH: 14 },
  { key: "criativos", label: "Criativos (imagens)", every: "a cada coleta", maxAgeH: 30 },
  { key: "google", label: "Google (transparência)", every: "a cada coleta, só sites novos", maxAgeH: 48 },
  { key: "reclameaqui", label: "Reclame Aqui", every: "1x por dia", maxAgeH: 30 },
  { key: "paginas", label: "Raio-X das páginas", every: "a cada coleta, só páginas novas", maxAgeH: 48 },
  { key: "ia", label: "IA (Gemini)", every: "a cada coleta, só o que mudou", maxAgeH: 48 },
  { key: "alertas", label: "Alertas (Telegram)", every: "a cada coleta", maxAgeH: 30 },
];

const ago = (iso: string | null) => {
  if (!iso) return "nunca";
  const h = (Date.now() - Date.parse(iso)) / 36e5;
  if (h < 1) return `há ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `há ${Math.round(h)} h`;
  return `há ${Math.round(h / 24)} dias`;
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function Status() {
  const client = db();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: runs }, offers, pages, ai, creatives, alerts] = await Promise.all([
    client.from("runs").select("id, source, ok, items, message, finished_at").gte("finished_at", since).order("id", { ascending: false }).limit(400),
    client.from("offer_ranking").select("offer_key", { count: "exact", head: true }),
    client.from("landing_pages").select("url", { count: "exact", head: true }),
    client.from("offer_insights").select("offer_key", { count: "exact", head: true }),
    client.from("ads").select("library_id", { count: "exact", head: true }).not("thumb_path", "is", null),
    client.from("alerts_sent").select("offer_key", { count: "exact", head: true }),
  ]);
  const list = (runs ?? []) as Run[];

  const health = SOURCES.map((s) => {
    const mine = list.filter((r) => r.source === s.key);
    const last = mine[0] ?? null;
    const lastOk = mine.find((r) => r.ok) ?? null;
    const fails = mine.filter((r) => r.ok === false).length;
    const stale = !lastOk || (Date.now() - Date.parse(lastOk.finished_at!)) / 36e5 > s.maxAgeH;
    const state = !mine.length ? "sem dados" : last?.ok === false ? "falhou" : stale ? "atrasado" : "ok";
    return { ...s, last, lastOk, fails, runs: mine.length, state };
  });
  const bad = health.filter((h) => h.state === "falhou" || (h.state === "atrasado" && h.key === "meta")).length;
  // imagens em webp têm ~15 KB; o plano grátis do Supabase guarda 1 GB
  const storageMb = Math.round(((creatives.count ?? 0) * 15) / 1024);

  return (
    <>
      <section className="hero">
        <div>
          <p className="comment">{"// saúde do robô nos últimos 7 dias"}</p>
          <h1>{bad ? "Atenção no robô" : "Robô funcionando"}</h1>
          <p className="lede">
            Cada etapa da coleta grava o resultado aqui. Se alguma falhar, o aviso também chega no Telegram (quando estiver configurado).
          </p>
        </div>
        <Terminal
          title="status — zsh"
          lines={[
            <><span className="t-prompt">$</span> <span className="t-fn">radar.health</span>()</>,
            <>{"{"}</>,
            <>  <K>ofertas_no_ranking</K>: <N>{offers.count ?? 0}</N>,</>,
            <>  <K>paginas_analisadas</K>: <N>{pages.count ?? 0}</N>,</>,
            <>  <K>ofertas_com_ia</K>: <N>{ai.count ?? 0}</N>,</>,
            <>  <K>criativos_guardados</K>: <N>{creatives.count ?? 0}</N>, <C>{`// ~${storageMb} MB de 1024`}</C></>,
            <>  <K>alertas_enviados</K>: <N>{alerts.count ?? 0}</N>,</>,
            <>  <K>status</K>: {bad ? <span className="t-bad">&quot;{bad} com problema&quot;</span> : <S>ok</S>}</>,
            <>{"}"}</>,
          ]}
        />
      </section>

      <div className="grid" style={{ marginBottom: 28 }}>
        <table>
          <thead>
            <tr><th>etapa</th><th>estado</th><th>último sucesso</th><th className="n">itens</th><th className="n">falhas 7d</th><th>frequência</th></tr>
          </thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.key}>
                <td><b>{h.label}</b></td>
                <td><span className={`health h-${h.state.replace(" ", "-")}`}>{h.state}</span></td>
                <td className="mono">{h.lastOk ? <>{when(h.lastOk.finished_at)} <span className="dim">({ago(h.lastOk.finished_at)})</span></> : <span className="dim">nunca</span>}</td>
                <td className="n">{h.lastOk?.items ?? "—"}</td>
                <td className={`n ${h.fails ? "warn" : "dim"}`}>{h.fails}</td>
                <td className="dim">{h.every}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Últimas execuções</h2>
      <div className="grid">
        <table>
          <thead><tr><th>quando</th><th>etapa</th><th>resultado</th><th className="n">itens</th><th>detalhe</th></tr></thead>
          <tbody>
            {list.slice(0, 40).map((r) => (
              <tr key={r.id}>
                <td className="mono date">{when(r.finished_at)}</td>
                <td>{SOURCES.find((s) => s.key === r.source)?.label ?? r.source}</td>
                <td className={r.ok === false ? "warn" : "up"}>{r.ok === false ? "falhou" : "ok"}</td>
                <td className="n">{r.items ?? "—"}</td>
                <td className="dim detail">{(r.message ?? "").split("\n")[0].slice(0, 160)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty">Nenhuma execução nos últimos 7 dias.</div>}
      </div>
    </>
  );
}
