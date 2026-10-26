import { notFound } from "next/navigation";
import { db, fmtDate, libraryLink, type OfferRow } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Snap { day: string; cards: number; copies: number; pages: number }
interface Ad { library_id: string; advertiser: string; body: string | null; start_date: string | null; copies: number; last_seen: string; domain: string | null }

function Chart({ data }: { data: Snap[] }) {
  if (data.length < 2) return <p className="muted">O gráfico aparece a partir do segundo dia de coleta.</p>;
  const W = 640, H = 200, P = 30;
  const max = Math.max(...data.map((d) => d.copies), 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / (data.length - 1);
  const y = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const line = (k: "copies" | "cards") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolução de cópias e anúncios">
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
      <path d={line("copies")} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      <path d={line("cards")} fill="none" stroke="var(--up)" strokeWidth={2} strokeDasharray="5 4" />
      <text x={P} y={16}>máx {max} cópias</text>
      <text x={P} y={H - 8}>{fmtDate(data[0].day)}</text>
      <text x={W - P} y={H - 8} textAnchor="end">{fmtDate(data[data.length - 1].day)}</text>
      <text x={W - P} y={16} textAnchor="end">— cópias · - - no topo</text>
    </svg>
  );
}

export default async function Oferta({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const client = db();
  const [{ data: offer }, { data: snaps }, { data: ads }] = await Promise.all([
    client.from("offer_ranking").select("*").eq("offer_key", key).maybeSingle(),
    client.from("offer_snapshots").select("day, cards, copies, pages").eq("offer_key", key).order("day").limit(90),
    client.from("ads").select("library_id, advertiser, body, start_date, copies, last_seen, domain").eq("offer_key", key)
      .order("copies", { ascending: false }).limit(60),
  ]);
  if (!offer && !snaps?.length) notFound();
  const o = offer as OfferRow | null;
  const name = o?.advertiser ?? key.slice(2);

  return (
    <>
      <h1>{name}</h1>
      <p className="muted">
        {o?.domain ? <a href={`https://${o.domain}`} target="_blank" rel="noreferrer">{o.domain} ↗</a> : "sem site próprio identificado"}
        {o && o.advertisers.length > 1 && <> · páginas: {o.advertisers.join(", ")}</>}
      </p>

      {o && (
        <div className="stats">
          <div className="stat"><b>{o.score}</b><span className="muted">score</span></div>
          <div className="stat"><b>{o.copies}</b><span className="muted">cópias do criativo</span></div>
          <div className="stat"><b className={o.copies_growth > 0 ? "up" : ""}>{o.copies_growth > 0 ? "+" : ""}{o.copies_growth}</b><span className="muted">cópias em 7 dias</span></div>
          <div className="stat"><b>{o.google_ads ?? "—"}</b><span className="muted">anúncios no Google</span></div>
          <div className="stat"><b>{fmtDate(o.oldest_start)}</b><span className="muted">anúncio ativo mais antigo</span></div>
        </div>
      )}

      <div className="grid2">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Evolução</h3>
          <Chart data={(snaps ?? []) as Snap[]} />
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Onde espionar</h3>
          <p><a href={libraryLink(o?.domain ?? name)} target="_blank" rel="noreferrer">Todos os anúncios ativos na Biblioteca da Meta ↗</a></p>
          {o?.domain && <p><a href={`https://adstransparency.google.com/?region=BR&domain=${o.domain}`} target="_blank" rel="noreferrer">Anúncios no Google ↗</a></p>}
          {o?.domain && <p><a href={`https://www.reclameaqui.com.br/busca/?q=${encodeURIComponent(o.domain.split(".")[0])}`} target="_blank" rel="noreferrer">Reputação no Reclame Aqui ↗</a></p>}
          {o?.keywords?.length ? <p>{o.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</p> : null}
        </div>
      </div>

      <h3>Anúncios coletados ({ads?.length ?? 0})</h3>
      <div className="panel">
        {((ads ?? []) as Ad[]).map((a) => (
          <div className="ad" key={a.library_id}>
            <div>
              <b>{a.advertiser}</b>
              <span className="muted"> · desde {fmtDate(a.start_date)} · {a.copies} {a.copies === 1 ? "cópia" : "cópias"} · </span>
              <a href={`https://www.facebook.com/ads/library/?id=${a.library_id}`} target="_blank" rel="noreferrer">ver anúncio ↗</a>
            </div>
            {a.body && <p>{a.body}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
