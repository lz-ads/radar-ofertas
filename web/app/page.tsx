import Link from "next/link";
import { Suspense } from "react";
import { COUNTRIES, countryName, creativeSrc, db, DEST_LABEL, flag, fmtDate, KIND_LABEL, libraryLink, priceRange, shortUrl, type DestType, type OfferRow } from "@/lib/db";
import { countAll, hrefWith, isFiltered, PAGE_SIZE, parseFilters, queryOffers, STRONG_SIGNAL, type Filters, type SortKey } from "@/lib/query";
import { toggleFavorite } from "./actions";
import { CopyButton, Thumb } from "./bits";
import { FilterBar } from "./filter-bar";
import { C, Cursor, K, N, S, Terminal } from "./terminal";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const fmtRun = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Cabeçalho que ordena ao clicar (segundo clique inverte). */
function SortTh({ f, k, label, num, title }: { f: Filters; k: SortKey; label: string; num?: boolean; title?: string }) {
  const active = f.sort === k;
  const nextDir = active ? (f.dir === "desc" ? "asc" : "desc") : ["nome", "desde", "preco"].includes(k) ? "asc" : "desc";
  return (
    <th className={num ? "n" : undefined} aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : undefined} title={title}>
      <Link className={`sort${active ? " on" : ""}`} href={hrefWith(f, { sort: k, dir: nextDir, limit: PAGE_SIZE })} scroll={false}>
        {label}<span className="arrow" aria-hidden="true">{active ? (f.dir === "desc" ? "↓" : "↑") : "↕"}</span>
      </Link>
    </th>
  );
}

type FacetRow = Pick<OfferRow, "keywords" | "niche" | "kind" | "dest_type" | "checkout" | "platform" | "country">;

/** Conta valores para os seletores de filtro (só mostra opções que existem). */
function facet(rows: FacetRow[], pick: (r: FacetRow) => (string | null)[], label: (v: string) => string = (v) => v) {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of new Set(pick(r))) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: label(value), count }));
}

export default async function Ranking({ searchParams }: { searchParams: Search }) {
  const f = parseFilters(await searchParams);
  const client = db();

  const kwQuery = client.from("keywords").select("term, country").eq("active", true).order("term");
  const growQuery = client.from("offer_ranking").select("offer_key", { count: "exact", head: true }).gt("copies_growth", 0);
  const [{ offers, error, total }, withWeak, { data: kws }, { data: allRows }, { data: lastRun }, { count: growingAll }] = await Promise.all([
    queryOffers(client, f),
    countAll(client, f),
    kwQuery,
    client.from("offer_ranking").select("keywords, niche, kind, dest_type, checkout, platform, country").eq("discarded", false).or(STRONG_SIGNAL).limit(5000),
    client.from("runs").select("source, ok, finished_at").eq("source", "meta").order("id", { ascending: false }).limit(1),
    f.pais === "todos" ? growQuery : growQuery.eq("country", f.pais),
  ]);

  if (error) {
    return (
      <Terminal
        title="erro.log"
        lines={[<span key="e" className="t-bad">Erro ao ler o banco: {error.message}</span>, <C key="c">{"// confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel; se for coluna nova, rode a migração do Supabase"}</C>]}
      />
    );
  }

  const everyRow = (allRows ?? []) as FacetRow[];
  // contagem por país (seletor) e facetas só do país escolhido
  const byCountry = new Map<string, number>();
  for (const r of everyRow) byCountry.set(r.country ?? "BR", (byCountry.get(r.country ?? "BR") ?? 0) + 1);
  const allKws = (kws ?? []) as { term: string; country: string | null }[];
  const countryOpts = [...new Set(["BR", ...byCountry.keys(), ...allKws.map((k) => (k.country || "BR").toUpperCase())])]
    .sort((a, b) => (a === "BR" ? -1 : b === "BR" ? 1 : (byCountry.get(b) ?? 0) - (byCountry.get(a) ?? 0)))
    .map((c) => ({ value: c, label: `${flag(c)} ${countryName(c)}`, count: byCountry.get(c) ?? 0 }));
  const rows = f.pais === "todos" ? everyRow : everyRow.filter((r) => (r.country ?? "BR") === f.pais);
  const totalAll = rows.length;
  const cur = f.pais === "todos" ? null : COUNTRIES[f.pais]?.currency ?? null;
  const currencySymbol = cur ? (new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).formatToParts(0).find((p) => p.type === "currency")?.value ?? cur) : "";
  const placeName = f.pais === "todos" ? "no mundo" : f.pais === "BR" ? "no Brasil" : `em ${countryName(f.pais)}`;
  const counts = new Map<string, number>();
  for (const r of rows) for (const k of r.keywords ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  const terms = [...new Set(allKws.filter((k) => f.pais === "todos" || (k.country || "BR").toUpperCase() === f.pais).map((k) => k.term))];
  const keywordChips = terms
    .map((term) => ({ term, count: counts.get(term) ?? 0 }))
    .filter((k) => k.count > 0 || k.term === f.kw) // palavra sem oferta não vira botão
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  const facets = {
    nicho: facet(rows, (r) => [r.niche]),
    tipo: facet(rows, (r) => [r.kind], (v) => KIND_LABEL[v] ?? v),
    destino: facet(rows, (r) => [r.dest_type], (v) => DEST_LABEL[v as DestType] ?? v),
    checkout: facet(rows, (r) => [r.checkout, r.platform]),
  };

  const run = lastRun?.[0] as { source: string; ok: boolean | null; finished_at: string } | undefined;
  const topScore = Math.max(...offers.map((o) => o.score), 1);
  const filtered = isFiltered(f);
  const exportHref = hrefWith({ ...f, limit: PAGE_SIZE }, {}, "/api/export");

  return (
    <>
      <section className="hero">
        <div>
          <p className="comment">{`// meta · google${f.pais === "BR" ? " · reclame aqui" : ""} — ${f.pais === "todos" ? "todos os países" : countryName(f.pais).toLowerCase()}`}</p>
          <h1>Ofertas escalando {placeName}</h1>
          <p className="lede">
            Quem está duplicando criativo, abrindo páginas novas e anunciando no Google ao mesmo tempo. O ranking soma esses sinais e
            destaca quem acelerou na última semana.
          </p>
        </div>
        <Terminal
          title="radar — zsh"
          lines={[
            <><span className="t-prompt">$</span> <span className="t-fn">radar.status</span>()</>,
            <>{"{"}</>,
            <>  <K>ofertas</K>: <N>{totalAll ?? 0}</N>,</>,
            <>  <K>crescendo_7d</K>: <N>{growingAll ?? 0}</N>,</>,
            <>  <K>palavras_chave</K>: <N>{terms.length}</N>,</>,
            run ? (
              <>  <K>ultima_coleta</K>: <S>{fmtRun(run.finished_at)}</S>,</>
            ) : (
              <>  <K>ultima_coleta</K>: <span className="t-com">null</span>,</>
            ),
            <>  <K>status</K>: {run?.ok === false ? <Link href="/status" className="t-bad">&quot;com falha&quot;</Link> : <span className="t-ok">&quot;online&quot;</span>}</>,
            <>{"}"}</>,
            <><span className="t-prompt">$</span> <Cursor /></>,
          ]}
        />
      </section>

      <Suspense>
        <FilterBar countries={countryOpts} currencySymbol={currencySymbol || "R$"} keywords={keywordChips} facets={facets} shown={offers.length} total={total} hiddenWeak={withWeak === null ? 0 : withWeak - total} exportHref={exportHref} />
      </Suspense>

      <div className="grid">
        <table className="ranking">
          <thead>
            <tr>
              <th className="n" aria-label="Posição"></th>
              <SortTh f={f} k="nome" label="oferta" />
              <SortTh f={f} k="score" label="score" num />
              <SortTh f={f} k="topo" label="no_topo" num title="Anúncios entre os mais vistos nas buscas" />
              <SortTh f={f} k="copias" label="copias" num title="Soma de 'X anúncios usam esse criativo'" />
              <SortTh f={f} k="crescimento" label="7d" num title="Cópias novas contra 7 dias atrás" />
              <SortTh f={f} k="paginas" label="paginas" num title="Páginas do Facebook rodando a mesma oferta" />
              <SortTh f={f} k="google" label="google" num title="Anúncios no Centro de Transparência do Google" />
              <SortTh f={f} k="desde" label="desde" title="Anúncio ativo mais antigo (e há quantos dias está no ar)" />
              <SortTh f={f} k="preco" label="pagina_de_vendas" title="Ordena pelo menor preço encontrado na página" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => {
              const price = priceRange(o.price_min, o.price_max, o.currency);
              const meta = [o.niche, o.kind ? KIND_LABEL[o.kind] ?? o.kind : null].filter(Boolean);
              return (
                <tr key={o.offer_key} className={o.status ? `st-${o.status}` : undefined}>
                  <td className="gutter">
                    {i + 1}
                    <form action={toggleFavorite}>
                      <input type="hidden" name="key" value={o.offer_key} />
                      <input type="hidden" name="current" value={o.status ?? ""} />
                      <button
                        className={`star${o.status ? " on" : ""}`}
                        title={o.status && o.status !== "favorita" ? `No funil: ${o.status}` : o.status ? "Tirar dos favoritos" : "Favoritar"}
                        aria-label={o.status === "favorita" ? "Tirar dos favoritos" : "Favoritar"}
                        aria-pressed={!!o.status}
                      >
                        {o.status ? "★" : "☆"}
                      </button>
                    </form>
                  </td>
                  <td className="offer-cell">
                    <Thumb src={creativeSrc(o.thumb_path, o.thumb_url)} alt={`Criativo de ${o.advertiser}`} />
                    <div className="offer-main">
                      {f.pais === "todos" && <span className="flag" title={countryName(o.country)}>{flag(o.country)}</span>}
                      <Link className="offer-name" href={`/oferta/${encodeURIComponent(o.offer_key)}`}>{o.advertiser}</Link>
                      {o.domain && <span className="domain">{o.domain}</span>}
                      {(meta.length > 0 || o.risk === "alto" || (o.status && o.status !== "favorita") || o.long_runners > 0 || o.cooling || o.watched || o.has_kit || o.pixels?.includes("TikTok") || o.pixels?.includes("Kwai")) && (
                        <div className="meta-line">
                          {meta.map((m) => <span key={m}>{m}</span>)}
                          {o.long_runners > 0 && <span className="badge ok" title={`${o.long_runners} anúncio(s) rodando há 30+ dias: sinal de oferta validada`}>✓ 30d+ ×{o.long_runners}</span>}
                          {o.cooling && <span className="badge cold" title="Cópias caindo forte contra 7 dias atrás">🧊 esfriando</span>}
                          {o.watched && <span className="badge" title="Na sua lista de espionagem">👁</span>}
                          {o.pixels?.includes("TikTok") && <span className="badge tt" title="A página de vendas tem o pixel do TikTok: a oferta provavelmente roda TikTok Ads">TikTok</span>}
                          {o.pixels?.includes("Kwai") && <span className="badge kw" title="A página de vendas tem o pixel do Kwai: a oferta provavelmente roda Kwai Ads">Kwai</span>}
                          {o.has_kit && <Link className="badge" href={`/oferta/${encodeURIComponent(o.offer_key)}#kit`} title="Kit de modelagem pronto">kit</Link>}
                          {o.risk === "alto" && <span className="risk" title={o.risk_reason ?? "Promessa arriscada para as políticas de anúncio"}>⚠ risco alto</span>}
                          {o.status && o.status !== "favorita" && <span className="pill">{o.status}</span>}
                        </div>
                      )}
                      {o.promise ? <div className="snippet promise">{o.promise}</div> : o.sample_text && <div className="snippet">{o.sample_text.slice(0, 120)}</div>}
                      {o.pages > 1 && <div className="also">também em {o.advertisers.slice(1, 4).join(", ")}{o.advertisers.length > 4 ? "…" : ""}</div>}
                      <div className="tags">{o.keywords.map((k) => (
                        <Link key={k} className={`tag-kw${f.kw === k ? " on" : ""}`} href={hrefWith(f, { kw: f.kw === k ? "" : k, limit: PAGE_SIZE })} scroll={false}>{k}</Link>
                      ))}</div>
                    </div>
                  </td>
                  <td className="n">
                    <div className="score">
                      <b>{o.score}</b>
                      <span className="meter" aria-hidden="true"><i style={{ width: `${Math.round((o.score / topScore) * 100)}%` }} /></span>
                    </div>
                  </td>
                  <td className="n">{o.cards}</td>
                  <td className="n">{o.copies}</td>
                  <td className="n">
                    {o.copies_7d === null ? <span className="delta new">novo</span>
                      : o.copies_growth > 0 ? <span className="delta up">▲ {o.copies_growth}</span>
                      : <span className="delta dim">{o.copies_growth}</span>}
                  </td>
                  <td className="n">{o.pages}</td>
                  <td className="n">{o.google_ads ?? <span className="dim">—</span>}</td>
                  <td className="mono date">
                    {fmtDate(o.oldest_start)}
                    {o.days_running !== null && o.days_running !== undefined && <div className={`days${o.days_running >= 30 ? " long" : ""}`}>{o.days_running} dias</div>}
                  </td>
                  <td className="landing">
                    {o.landing_url ? (
                      <span className="landing-wrap">
                        <a href={o.landing_url} target="_blank" rel="noreferrer noopener" title={o.landing_url}>{shortUrl(o.landing_url, 30)}</a>
                        <CopyButton text={o.landing_url} />
                      </span>
                    ) : (
                      <span className="dim mono">{o.dest_type && o.dest_type !== "site" ? `via ${DEST_LABEL[o.dest_type]}` : "sem link"}</span>
                    )}
                    {(price || o.checkout || o.platform || o.cod) && (
                      <div className="xray">
                        {price && <b>{price}</b>}
                        {(o.checkout || o.platform) && <span>{o.checkout ?? o.platform}</span>}
                        {o.cod && <span className="cod" title="Pagamento na entrega">COD</span>}
                        {o.has_vsl && <span title="Página com vídeo de vendas">VSL</span>}
                      </div>
                    )}
                    <div className="sublinks">
                      {o.page_url && <a href={o.page_url} target="_blank" rel="noreferrer" title="Página do anunciante no Facebook">página fb ↗</a>}
                      <a href={libraryLink(o.domain ?? o.advertiser, o.country)} target="_blank" rel="noreferrer" title="Anúncios ativos na Biblioteca da Meta">biblioteca ↗</a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {offers.length === 0 && (
          <div className="empty">
            {withWeak ? <>Nenhuma oferta com sinal de escala nesses filtros. <Link href={hrefWith(f, { todas: true })}>Mostrar {withWeak} com sinal fraco</Link></>
              : filtered ? <>Nenhuma oferta com esses filtros. <Link href="/">Limpar filtros</Link></>
              : <>Ainda sem ofertas. Rode a coleta no GitHub em <code>Actions → Coletar ofertas → Run workflow</code>.</>}
          </div>
        )}
      </div>

      {offers.length < total && (
        <div className="more">
          <Link className="btn ghost" href={hrefWith(f, { limit: f.limit + PAGE_SIZE })} scroll={false}>
            Mostrar mais {Math.min(PAGE_SIZE, total - offers.length)}
          </Link>
          <span className="mono dim">{offers.length} de {total}</span>
        </div>
      )}
    </>
  );
}
