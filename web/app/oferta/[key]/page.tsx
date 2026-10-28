import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countryName, countryOfKey, creativeSrc, daysLabel, db, DEST_LABEL, flag, fmtDate, keyLabel, KIND_LABEL, libraryLink, priceRange, shortUrl,
  storageUrl, STATUSES, STATUS_LABEL, type OfferRow,
} from "@/lib/db";
import type { KitStructure, MyInput } from "@/lib/kit";
import { saveNote, setStatus, toggleWatch } from "../../actions";
import { CopyButton, Thumb } from "../../bits";
import { DownloadAll, MyVersionForm, TextActions } from "../../kit-client";

export const dynamic = "force-dynamic";
// a "sua versão" chama a IA e pode levar até 1 minuto
export const maxDuration = 60;

interface Snap { day: string; cards: number; copies: number; pages: number }
interface Ad {
  library_id: string; advertiser: string; body: string | null; start_date: string | null; copies: number; last_seen: string;
  domain: string | null; landing_url: string | null; page_url: string | null; thumb_url: string | null; thumb_path: string | null;
  media_type: string | null; cta: string | null; media_path: string | null; video_url: string | null;
}
interface Tr { library_id: string; transcript: string | null; hook: string | null; structure: string | null; cta: string | null }
interface Kit { structure: KitStructure | null; model: string | null; updated_at: string; my_input: MyInput | null; my_version: string | null; my_model: string | null; my_updated_at: string | null }
interface Landing {
  url: string; final_url: string | null; title: string | null; description: string | null; platform: string | null; checkout: string | null;
  prices: (number | string)[]; price_min: number | string | null; price_max: number | string | null; installments: string | null;
  cod: boolean; has_vsl: boolean; has_countdown: boolean; has_whatsapp: boolean; pixels: string[]; error: string | null; checked_at: string;
  currency: string | null; shot_path: string | null;
}

/** Nome de arquivo para baixar: "constlivre-1234567.mp4" */
const fileName = (advertiser: string, id: string, path: string) =>
  `${advertiser.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "criativo"}-${id}.${path.split(".").pop()}`;

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

  const [{ data: offer }, { data: snaps }, { data: ads }, { data: kitRow }] = await Promise.all([
    client.from("offer_ranking").select("*").eq("offer_key", key).maybeSingle(),
    client.from("offer_snapshots").select("day, cards, copies, pages").eq("offer_key", key).order("day").limit(90),
    client.from("ads").select("library_id, advertiser, body, start_date, copies, last_seen, domain, landing_url, page_url, thumb_url, thumb_path, media_type, cta, media_path, video_url")
      .eq("offer_key", key).order("copies", { ascending: false }).limit(60),
    client.from("offer_kits").select("structure, model, updated_at, my_input, my_version, my_model, my_updated_at").eq("offer_key", key).maybeSingle(),
  ]);
  if (!offer && !snaps?.length) notFound();
  const o = offer as OfferRow | null;
  const country = o?.country ?? countryOfKey(key);
  const name = o?.advertiser ?? keyLabel(key);
  const list = (ads ?? []) as Ad[];
  const [{ data: lp }, { data: trs }] = await Promise.all([
    o?.landing_url ? client.from("landing_pages").select("*").eq("url", o.landing_url).maybeSingle() : Promise.resolve({ data: null }),
    list.length ? client.from("ad_transcripts").select("library_id, transcript, hook, structure, cta").in("library_id", list.map((a) => a.library_id)) : Promise.resolve({ data: [] }),
  ]);
  const page = lp as Landing | null;
  const kit = kitRow as Kit | null;
  const transcripts = new Map(((trs ?? []) as Tr[]).map((t) => [t.library_id, t]));
  const gallery = list.filter((a) => a.thumb_path || a.thumb_url).slice(0, 24);
  const prices = page?.prices?.map(Number).filter((n) => Number.isFinite(n)) ?? [];
  const downloads = list
    .filter((a) => a.media_path)
    .map((a) => ({ id: a.library_id, url: storageUrl("midia", a.media_path!)!, name: fileName(a.advertiser, a.library_id, a.media_path!) }))
    .filter((d) => d.url);
  const dl = new Map(downloads.map((d) => [d.id, d]));
  const shot = page?.shot_path ? storageUrl("paginas", page.shot_path) : null;
  const st = kit?.structure ?? null;

  return (
    <>
      <p className="comment"><Link href={country === "BR" ? "/" : `/?pais=${country}`}>ranking</Link>{" / "}<span>{flag(country)} {o?.domain ?? "oferta"}</span></p>
      <h1>{name}</h1>
      <p className="lede" style={{ marginBottom: 20 }}>
        {o?.domain ? <a className="mono" href={`https://${o.domain}`} target="_blank" rel="noreferrer">{o.domain} ↗</a> : "Sem site próprio identificado."}
        {o && o.advertisers.length > 1 && <> Rodando em {o.advertisers.length} páginas: {o.advertisers.join(", ")}.</>}
      </p>

      <div className="offer-actions">
        {/* funil: status em um clique */}
        <form action={setStatus} className="status-bar" aria-label="Status no funil">
          <input type="hidden" name="key" value={key} />
          {STATUSES.map((s) => (
            <button key={s} name="status" value={o?.status === s ? "" : s} className={`status-btn s-${s}`} aria-pressed={o?.status === s}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </form>
        <div className="status-bar">
          {o && (
            <form action={toggleWatch}>
              <input type="hidden" name="key" value={key} />
              <button className="status-btn watch" aria-pressed={o.watched} title="O robô busca esta oferta a cada coleta e avisa no Telegram quando sair criativo novo">
                {o.watched ? "👁 espionando" : "👁 espionar"}
              </button>
            </form>
          )}
          <a className="status-btn" href={`/api/kit/${encodeURIComponent(key)}`} title="Tudo desta oferta num arquivo .md (estrutura, preços, anúncios, transcrições, sua versão)">⬇ exportar kit</a>
        </div>
      </div>

      {o && (
        <div className="readout">
          <div><b>{o.score}</b><span>score</span></div>
          <div><b>{o.copies}</b><span>cópias do criativo</span></div>
          <div><b className={o.copies_growth > 0 ? "up" : ""}>{o.copies_7d === null ? "novo" : `${o.copies_growth > 0 ? "+" : ""}${o.copies_growth}`}</b><span>cópias em 7 dias</span></div>
          <div><b>{o.google_ads ?? "—"}</b><span>anúncios no Google</span></div>
          <div><b>{daysLabel(o.days_running)}</b><span>no ar desde {fmtDate(o.oldest_start)}</span></div>
          <div><b className={o.long_runners > 0 ? "up" : ""}>{o.long_runners}</b><span>anúncios com 30+ dias</span></div>
          <div><b className={o.cooling ? "warn" : ""}>{o.ads_active}</b><span>{o.cooling ? "ativos · 🧊 esfriando" : "anúncios ativos"}</span></div>
          <div><b>{o.new_ads_7d}</b><span>criativos novos (7 dias)</span></div>
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
            <li><a href={libraryLink(o?.domain ?? name, country)} target="_blank" rel="noreferrer">Biblioteca da Meta ({flag(country)} {countryName(country)}) ↗</a></li>
            {o?.domain && <li><a href={`https://adstransparency.google.com/?region=${country}&domain=${o.domain}`} target="_blank" rel="noreferrer">Transparência do Google ↗</a></li>}
            {o?.domain && country === "BR" && <li><a href={`https://www.reclameaqui.com.br/busca/?q=${encodeURIComponent(o.domain.split(".")[0])}`} target="_blank" rel="noreferrer">Reclame Aqui ↗</a></li>}
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
              <Row k="preços">{prices.length ? prices.map((p) => priceRange(p, p, page.currency)).join(" · ") : <span className="dim">nenhum na página</span>}</Row>
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

      {/* ---------- Kit de modelagem ---------- */}
      <section className="panel kit" id="kit" style={{ marginBottom: 20 }}>
        <div className="kit-head">
          <h2>Kit de modelagem</h2>
          <span className="dim mono">{st ? `mapa por ${kit?.model ?? "IA"} · ${new Date(kit!.updated_at).toLocaleDateString("pt-BR")}` : ""}</span>
        </div>
        <div className="kit-grid">
          <div className="shot-col">
            <span className="dim mono">print_da_pagina</span>
            {shot ? (
              <a className="shot" href={shot} target="_blank" rel="noreferrer" title="Abrir o print da página inteira">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot} alt={`Print da página de vendas de ${name}`} loading="lazy" />
              </a>
            ) : (
              <p className="muted">{o?.landing_url ? "O robô tira o print da página inteira (no celular) na próxima coleta." : "Sem página de vendas."}</p>
            )}
            {shot && <a className="ext-link" href={shot} target="_blank" rel="noreferrer">abrir inteiro ↗</a>}
          </div>
          <div className="map-col">
            {st ? (
              <>
                {st.resumo && <p className="kit-sum">{st.resumo}</p>}
                <dl className="kvs">
                  {st.angulo && <Row k="ângulo">{st.angulo}</Row>}
                  {st.promessa && <Row k="promessa">{st.promessa}</Row>}
                  {st.mecanismo && <Row k="mecanismo">{st.mecanismo}</Row>}
                  {st.funil && <Row k="funil">{st.funil}</Row>}
                </dl>
                <h3>Estrutura da página</h3>
                <ol className="sections">
                  {(st.secoes ?? []).map((x, i) => (
                    <li key={i}><span className="sec-type mono">{x.tipo}</span> <b>{x.titulo}</b> <span className="dim">— {x.resumo}</span></li>
                  ))}
                </ol>
                <h3>Oferta</h3>
                <ul className="plain">
                  {(st.oferta?.kits ?? []).map((k, i) => <li key={i}><b>{k.nome}</b> · {k.preco}</li>)}
                  {!!st.oferta?.bonus?.length && <li>bônus: {st.oferta.bonus.join(", ")}</li>}
                  {st.oferta?.garantia && <li>garantia: {st.oferta.garantia}</li>}
                  {st.oferta?.frete && <li>frete: {st.oferta.frete}</li>}
                  {st.oferta?.pagamento && <li>pagamento: {st.oferta.pagamento}</li>}
                  {st.oferta?.escassez && <li>escassez: {st.oferta.escassez}</li>}
                </ul>
                <div className="kit-cols">
                  <div><h3>Provas</h3><ul className="plain">{(st.provas ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><h3>Objeções quebradas</h3><ul className="plain">{(st.objecoes ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
                <h3>Ideias de teste</h3>
                <ul className="plain">{(st.ideias_de_teste ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            ) : (
              <p className="muted">
                {page?.shot_path || o?.landing_url
                  ? "A IA monta o mapa da página (seções, oferta, provas, funil e ideias de teste) nas próximas coletas. Ofertas do seu funil e da espionagem têm prioridade."
                  : "Sem página de vendas para mapear."}
              </p>
            )}
          </div>
        </div>

        <div className="my-version">
          <h3>Minha versão <span className="dim mono">// a IA escreve página, ganchos, roteiros e anúncios para o SEU produto, na mesma estrutura</span></h3>
          <MyVersionForm
            offerKey={key}
            hasVersion={!!kit?.my_version}
            defaults={{
              produto: kit?.my_input?.produto ?? "", marca: kit?.my_input?.marca ?? "", preco: kit?.my_input?.preco ?? "",
              diferencial: kit?.my_input?.diferencial ?? "", publico: kit?.my_input?.publico ?? "",
              idioma: kit?.my_input?.idioma ?? (country === "BR" ? "português do Brasil" : country === "PT" ? "português de Portugal" : country === "JP" ? "japonês" : country === "GB" ? "inglês britânico" : "inglês dos EUA"),
            }}
          />
          {kit?.my_version && (
            <div className="md-out">
              <div className="md-bar">
                <span className="dim mono">{kit.my_model} · {kit.my_updated_at ? new Date(kit.my_updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}</span>
                <TextActions text={kit.my_version} fileName={`minha-versao-${keyLabel(key).replace(/[^a-z0-9.]+/gi, "-")}.md`} />
              </div>
              <pre className="md">{kit.my_version}</pre>
            </div>
          )}
        </div>
      </section>

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
          <div className="section-head">
            <h2>Criativos <span className="dim mono" style={{ fontSize: 14 }}>[{gallery.length}]</span></h2>
            <DownloadAll files={downloads.map((d) => ({ url: d.url, name: d.name }))} zipName={`criativos-${keyLabel(key).replace(/[^a-z0-9.]+/gi, "-")}.zip`} />
          </div>
          {!downloads.length && (
            <p className="muted" style={{ marginTop: -6 }}>
              O robô guarda o vídeo/imagem original dos 3 melhores anúncios das ofertas prioritárias (seu funil, espionagem e top 40). Esta ainda não tem arquivos guardados — favorite ou espione para entrar na fila.
            </p>
          )}
          <div className="gallery" style={{ marginBottom: 32 }}>
            {gallery.map((a) => {
              const d = dl.get(a.library_id);
              return (
                <div key={a.library_id} className="g-item" title={`${a.advertiser} · ${a.copies} ${a.copies === 1 ? "cópia" : "cópias"}`}>
                  <a href={`https://www.facebook.com/ads/library/?id=${a.library_id}`} target="_blank" rel="noreferrer">
                    <Thumb src={creativeSrc(a.thumb_path, a.thumb_url)} alt={`Criativo de ${a.advertiser}`} video={a.media_type === "video"} />
                  </a>
                  <span className="g-cap mono">{a.copies}×</span>
                  {d ? (
                    <a className="g-dl" href={`${d.url}?download=${encodeURIComponent(d.name)}`} download={d.name} title={`Baixar ${d.name}`} aria-label={`Baixar ${a.media_type === "video" ? "vídeo" : "imagem"}`}>⬇</a>
                  ) : a.video_url || a.thumb_url ? (
                    <a className="g-dl ghost" href={a.video_url ?? a.thumb_url!} target="_blank" rel="noreferrer" title="Abrir o arquivo no Facebook (o link expira em poucos dias)" aria-label="Abrir arquivo original">↗</a>
                  ) : null}
                </div>
              );
            })}
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
                {dl.get(a.library_id) && <a className="ext-link" href={`${dl.get(a.library_id)!.url}?download=${encodeURIComponent(dl.get(a.library_id)!.name)}`} download={dl.get(a.library_id)!.name}>⬇ baixar {a.media_type === "video" ? "vídeo" : "imagem"}</a>}
              </div>
              {a.body && <p>{a.body}</p>}
              {transcripts.get(a.library_id) && (
                <details className="tr">
                  <summary>
                    <span className="mono">transcrição</span> <b>gancho:</b> {transcripts.get(a.library_id)!.hook}
                  </summary>
                  <p><b>Estrutura:</b> {transcripts.get(a.library_id)!.structure}</p>
                  <p><b>Chamada:</b> {transcripts.get(a.library_id)!.cta}</p>
                  <p className="tr-text">{transcripts.get(a.library_id)!.transcript}</p>
                </details>
              )}
            </div>
          </article>
        ))}
        {!list.length && <p className="muted" style={{ margin: 0 }}>Nenhum anúncio salvo para esta oferta.</p>}
      </section>
    </>
  );
}
