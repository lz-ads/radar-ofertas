import Link from "next/link";
import { notFound } from "next/navigation";
import { creativeSrc, db, DEST_LABEL, fmtDate, KIND_LABEL, libraryLink, priceRange, shortUrl, STATUSES, STATUS_LABEL, type OfferRow } from "@/lib/db";
import { saveNote, setStatus } from "../../actions";
import { CopyButton, Thumb } from "../../bits";

export const dynamic = "force-dynamic";

interface Snap { day: string; cards: number; copies: number; pages: number }
interface Ad {
  library_id: string; advertiser: string; body: string | null; start_date: string | null; copies: number; last_seen: string;
  domain: string | null; landing_url: string | null; page_url: string | null; thumb_url: string | null; thumb_path: string | null;
  media_type: string | null; cta: string | null;
}
interface Landing {
  url: string; final_url: string | null; title: string | null; description: string | null; platform: string | null; checkout: string | null;
  prices: (number | string)[]; price_min: number | string | null; price_max: number | string | null; installments: string | null;
  cod: boolean; has_vsl: boolean; has_countdown: boolean; has_whatsapp: boolean; pixels: string[]; error: string | null; checked_at: string;
}

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

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="kv"><dt>{k}</dt><dd>{children}</dd></div>
);
const yes = (v: boolean | null | undefined) => (v ? <span className="up">sim</span> : <span className="dim">não</span>);

export default async function Oferta({ params }: { params: Promise<{ key: string }> }) {
  let key = decodeURIComponent((await params).key);
  const client = db();
  // link antigo (anunciante sem site) que foi juntado a outra oferta
  const { data: alias } = await client.from("offer_aliases").select("target").eq("alias", key).maybeSingle();
  if (alias) key = (alias as { target: string }).target;

  const [{ data: offer }, { data: snaps }, { data: ads }] = await Promise.all([
    client.from("offer_ranking").select("*").eq("offer_key", key).maybeSingle(),
    client.from("offer_snapshots").select("day, cards, copies, pages").eq("offer_key", key).order("day").limit(90),
    client.from("ads").select("library_id, advertiser, body, start_date, copies, last_seen, domain, landing_url, page_url, thumb_url, thumb_path, media_type, cta")
      .eq("offer_key", key).order("copies", { ascending: false }).limit(60),
  ]);
  if (!offer && !snaps?.length) notFound();
  const o = offer as OfferRow | null;
  const name = o?.advertiser ?? key.slice(2);
  const list = (ads ?? []) as Ad[];
  const { data: lp } = o?.landing_url
    ? await client.from("landing_pages").select("*").eq("url", o.landing_url).maybeSingle()
    : { data: null };
  const page = lp as Landing | null;
  const gallery = list.filter((a) => a.thumb_path || a.thumb_url).slice(0, 24);
  const prices = page?.prices?.map(Number).filter((n) => Number.isFinite(n)) ?? [];

  return (
    <>
      <p className="comment"><Link href="/">ranking</Link>{" / "}<span>{o?.domain ?? "oferta"}</span></p>
      <h1>{name}</h1>
      <p className="lede" style={{ marginBottom: 20 }}>
        {o?.domain ? <a className="mono" href={`https://${o.domain}`} target="_blank" rel="noreferrer">{o.domain} ↗</a> : "Sem site próprio identificado."}
        {o && o.advertisers.length > 1 && <> Rodando em {o.advertisers.length} páginas: {o.advertisers.join(", ")}.</>}
      </p>

      {/* funil: status em um clique */}
      <form action={setStatus} className="status-bar" aria-label="Status no funil">
        <input type="hidden" name="key" value={key} />
        {STATUSES.map((s) => (
          <button key={s} name="status" value={o?.status === s ? "" : s} className={`status-btn s-${s}`} aria-pressed={o?.status === s}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </form>

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
          {!o?.landing_url && o?.dest_type && o.dest_type !== "site" && (
            <p className="muted" style={{ marginTop: 0 }}>Os anúncios levam para {DEST_LABEL[o.dest_type]}, não para uma página de vendas.</p>
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

      <div className="split even">
        <section className="panel">
          <h2>Raio-X da página</h2>
          {page && !page.error ? (
            <dl className="kvs">
              {page.title && <Row k="título">{page.title}</Row>}
              <Row k="feita em">{page.platform ?? <span className="dim">não identificado</span>}</Row>
              <Row k="checkout">{page.checkout ?? <span className="dim">não identificado</span>}</Row>
              <Row k="preços">{prices.length ? prices.map((p) => priceRange(p, p)).join(" · ") : <span className="dim">nenhum na página</span>}</Row>
              {page.installments && <Row k="parcelas">{page.installments}</Row>}
              <Row k="pagamento na entrega">{yes(page.cod)}</Row>
              <Row k="vídeo de vendas">{yes(page.has_vsl)}</Row>
              <Row k="contador / escassez">{yes(page.has_countdown)}</Row>
              <Row k="botão de WhatsApp">{yes(page.has_whatsapp)}</Row>
              <Row k="pixels">{page.pixels?.length ? page.pixels.join(", ") : <span className="dim">nenhum detectado</span>}</Row>
              <Row k="analisada em">{new Date(page.checked_at).toLocaleDateString("pt-BR")}</Row>
            </dl>
          ) : page?.error ? (
            <p className="muted">Não deu para abrir a página na última tentativa ({page.error.slice(0, 120)}). O robô tenta de novo em 7 dias.</p>
          ) : (
            <p className="muted">{o?.landing_url ? "A página entra na fila do robô na próxima coleta." : "Sem página de vendas para analisar."}</p>
          )}
        </section>

        <section className="panel">
          <h2>Leitura da IA</h2>
          {o?.niche ? (
            <dl className="kvs">
              <Row k="nicho">{o.niche}</Row>
              <Row k="tipo">{o.kind ? KIND_LABEL[o.kind] ?? o.kind : "—"}</Row>
              {o.audience && <Row k="público">{o.audience}</Row>}
              {o.promise && <Row k="promessa">{o.promise}</Row>}
              {o.mechanism && <Row k="mecanismo">{o.mechanism}</Row>}
              {o.offer && <Row k="oferta">{o.offer}</Row>}
              <Row k="risco de reprovação">
                <span className={o.risk === "alto" ? "warn" : o.risk === "baixo" ? "up" : ""}>{o.risk === "medio" ? "médio" : o.risk ?? "—"}</span>
                {o.risk_reason && <span className="dim"> · {o.risk_reason}</span>}
              </Row>
            </dl>
          ) : (
            <p className="muted">Ainda não classificada. A IA analisa as ofertas com sinal de escala a cada coleta.</p>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginBottom: 32 }}>
        <h2>Minhas notas</h2>
        <form action={saveNote} className="note-form">
          <input type="hidden" name="key" value={key} />
          <textarea name="note" defaultValue={o?.note ?? ""} rows={4} placeholder="Ângulo, o que modelar, ideias de criativo, resultado do teste…" aria-label="Notas sobre a oferta" />
          <button className="btn">Salvar nota</button>
        </form>
      </section>

      {gallery.length > 0 && (
        <>
          <h2>Criativos <span className="dim mono" style={{ fontSize: 14 }}>[{gallery.length}]</span></h2>
          <div className="gallery" style={{ marginBottom: 32 }}>
            {gallery.map((a) => (
              <a key={a.library_id} href={`https://www.facebook.com/ads/library/?id=${a.library_id}`} target="_blank" rel="noreferrer" className="g-item" title={`${a.advertiser} · ${a.copies} ${a.copies === 1 ? "cópia" : "cópias"}`}>
                <Thumb src={creativeSrc(a.thumb_path, a.thumb_url)} alt={`Criativo de ${a.advertiser}`} video={a.media_type === "video"} />
                <span className="g-cap mono">{a.copies}×</span>
              </a>
            ))}
          </div>
        </>
      )}

      <h2>Anúncios coletados <span className="dim mono" style={{ fontSize: 14 }}>[{list.length}]</span></h2>
      <section className="panel">
        {list.map((a) => (
          <article className="ad" key={a.library_id}>
            <Thumb src={creativeSrc(a.thumb_path, a.thumb_url)} alt={`Criativo de ${a.advertiser}`} video={a.media_type === "video"} />
            <div className="ad-body">
              <div className="ad-head">
                <b>{a.advertiser}</b>
                <span className="mono">desde {fmtDate(a.start_date)}</span>
                <span className="mono">{a.copies} {a.copies === 1 ? "cópia" : "cópias"}</span>
                {a.cta && <span className="mono">botão: {a.cta}</span>}
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
