import Link from "next/link";
import { notFound } from "next/navigation";
import { db, fmtDate, libraryLink, shortUrl, type OfferRow } from "@/lib/db";
import { CopyButton, Thumb } from "../../bits";

export const dynamic = "force-dynamic";

interface Snap { day: string; cards: number; copies: number; pages: number }
interface Ad { library_id: string; advertiser: string; body: string | null; start_date: string | null; copies: number; last_seen: string; domain: string | null; landing_url: string | null; page_url: string | null; thumb_url: string | null; media_type: string | null }

function Chart({ data }: { data: Snap[] }) {
  if (data.length < 2) {
    return <p className="muted">O gráfico aparece a partir do segundo dia de coleta. Até agora: {data.length} {data.length === 1 ? "dia" : "dias"}.</p>;
  }
  const W = 640, H = 220, P = 34;
  const max = Math.max(...data.map((d) => d.copies), 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / (data.length - 1);
  const y = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const path = (k: "copies" | "cards") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const area = `${path("copies")} L${x(data.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Cópias do criativo de ${data[0].copies} para ${data[data.length - 1].copies}`}>
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="#142039" strokeDasharray="2 6" />
      ))}
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#1f3159" />
      <path d={area} fill="url(#fill)" />
      <path d={path("copies")} fill="none" stroke="#7fb2ff" strokeWidth={2.5} strokeLinejoin="round" />
      <path d={path("cards")} fill="none" stroke="#2f6bff" strokeWidth={1.6} strokeDasharray="5 5" />
      <text x={P} y={20}>máx {max} cópias</text>
      <text x={P} y={H - 10}>{fmtDate(data[0].day)}</text>
      <text x={W - P} y={H - 10} textAnchor="end">{fmtDate(data[data.length - 1].day)}</text>
      <text x={W - P} y={20} textAnchor="end">— cópias   - - no topo</text>
    </svg>
  );
}

export default async function Oferta({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const client = db();
  const [{ data: offer }, { data: snaps }, { data: ads }] = await Promise.all([
    client.from("offer_ranking").select("*").eq("offer_key", key).maybeSingle(),
    client.from("offer_snapshots").select("day, cards, copies, pages").eq("offer_key", key).order("day").limit(90),
    client.from("ads").select("library_id, advertiser, body, start_date, copies, last_seen, domain, landing_url, page_url, thumb_url, media_type").eq("offer_key", key)
      .order("copies", { ascending: false }).limit(60),
  ]);
  if (!offer && !snaps?.length) notFound();
  const o = offer as OfferRow | null;
  const name = o?.advertiser ?? key.slice(2);
  const list = (ads ?? []) as Ad[];

  return (
    <>
      <p className="comment"><Link href="/">ranking</Link>{" / "}<span>{o?.domain ?? "oferta"}</span></p>
      <h1>{name}</h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        {o?.domain ? <a className="mono" href={`https://${o.domain}`} target="_blank" rel="noreferrer">{o.domain} ↗</a> : "Sem site próprio identificado."}
        {o && o.advertisers.length > 1 && <> Rodando em {o.advertisers.length} páginas: {o.advertisers.join(", ")}.</>}
      </p>

      {o && (
        <div className="readout">
          <div><b>{o.score}</b><span>score</span></div>
          <div><b>{o.copies}</b><span>cópias do criativo</span></div>
          <div><b className={o.copies_growth > 0 ? "up" : ""}>{o.copies_7d === null ? "novo" : `${o.copies_growth > 0 ? "+" : ""}${o.copies_growth}`}</b><span>cópias em 7 dias</span></div>
          <div><b>{o.google_ads ?? "—"}</b><span>anúncios no Google</span></div>
          <div><b>{fmtDate(o.oldest_start)}</b><span>anúncio ativo mais antigo</span></div>
        </div>
      )}

      <div className="split">
        <section className="panel">
          <h2>Evolução</h2>
          <Chart data={(snaps ?? []) as Snap[]} />
        </section>
        <section className="panel">
          <h2>Onde espionar</h2>
          {o?.landing_url && (
            <div className="landing-box">
              <span className="dim mono">pagina_de_vendas</span>
              <span className="landing-wrap">
                <a href={o.landing_url} target="_blank" rel="noreferrer noopener" title={o.landing_url}>{shortUrl(o.landing_url, 60)}</a>
                <CopyButton text={o.landing_url} />
              </span>
            </div>
          )}
          <ul className="links">
            {o?.page_url && <li><a href={o.page_url} target="_blank" rel="noreferrer">Página no Facebook ↗</a></li>}
            <li><a href={libraryLink(o?.domain ?? name)} target="_blank" rel="noreferrer">Biblioteca da Meta ↗</a></li>
            {o?.domain && <li><a href={`https://adstransparency.google.com/?region=BR&domain=${o.domain}`} target="_blank" rel="noreferrer">Transparência do Google ↗</a></li>}
            {o?.domain && <li><a href={`https://www.reclameaqui.com.br/busca/?q=${encodeURIComponent(o.domain.split(".")[0])}`} target="_blank" rel="noreferrer">Reclame Aqui ↗</a></li>}
          </ul>
          {o?.keywords?.length ? <div className="chips" style={{ marginTop: 14 }}>{o.keywords.map((k) => <span key={k} className="tag-kw">{k}</span>)}</div> : null}
        </section>
      </div>

      <h2>Anúncios coletados <span className="dim mono" style={{ fontSize: 14 }}>[{list.length}]</span></h2>
      <section className="panel">
        {list.map((a) => (
          <article className="ad" key={a.library_id}>
            <Thumb src={a.thumb_url} alt={`Criativo de ${a.advertiser}`} video={a.media_type === "video"} />
            <div className="ad-body">
            <div className="ad-head">
              <b>{a.advertiser}</b>
              <span className="mono">desde {fmtDate(a.start_date)}</span>
              <span className="mono">{a.copies} {a.copies === 1 ? "cópia" : "cópias"}</span>
              <a className="ext-link" href={`https://www.facebook.com/ads/library/?id=${a.library_id}`} target="_blank" rel="noreferrer">ver anúncio ↗</a>
              {a.landing_url && <a className="ext-link" href={a.landing_url} target="_blank" rel="noreferrer noopener" title={a.landing_url}>{shortUrl(a.landing_url, 34)} ↗</a>}
            </div>
            {a.body && <p>{a.body}</p>}
            </div>
          </article>
        ))}
        {!list.length && <p className="muted" style={{ margin: 0 }}>Nenhum anúncio salvo para esta oferta.</p>}
      </section>
    </>
  );
}
