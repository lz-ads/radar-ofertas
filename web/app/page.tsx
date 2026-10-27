import Link from "next/link";
import { Suspense } from "react";
import { db, fmtDate, libraryLink, shortUrl } from "@/lib/db";
import { countAll, hrefWith, isFiltered, PAGE_SIZE, parseFilters, queryOffers, type Filters, type SortKey } from "@/lib/query";
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
  const nextDir = active ? (f.dir === "desc" ? "asc" : "desc") : k === "nome" || k === "desde" ? "asc" : "desc";
  return (
    <th className={num ? "n" : undefined} aria-sort={active ? (f.dir === "asc" ? "ascending" : "descending") : undefined} title={title}>
      <Link className={`sort${active ? " on" : ""}`} href={hrefWith(f, { sort: k, dir: nextDir, limit: PAGE_SIZE })} scroll={false}>
        {label}<span className="arrow" aria-hidden="true">{active ? (f.dir === "desc" ? "↓" : "↑") : "↕"}</span>
      </Link>
    </th>
  );
}

export default async function Ranking({ searchParams }: { searchParams: Search }) {
  const f = parseFilters(await searchParams);
  const client = db();

  const [{ offers, error, total }, withWeak, { data: kws }, { data: allKw }, { data: lastRun }, { count: totalAll }, { count: growingAll }] = await Promise.all([
    queryOffers(client, f),
    countAll(client, f),
    client.from("keywords").select("term").eq("active", true).order("term"),
    client.from("offer_ranking").select("keywords").limit(2000),
    client.from("runs").select("source, ok, finished_at").order("id", { ascending: false }).limit(1),
    client.from("offer_ranking").select("offer_key", { count: "exact", head: true }),
    client.from("offer_ranking").select("offer_key", { count: "exact", head: true }).gt("copies_growth", 0),
  ]);

  if (error) {
    return (
      <Terminal
        title="erro.log"
        lines={[<span key="e" className="t-bad">Erro ao ler o banco: {error.message}</span>, <C key="c">{"// confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel"}</C>]}
      />
    );
  }

  // quantas ofertas cada palavra-chave trouxe (para os botões de filtro)
  const counts = new Map<string, number>();
  for (const r of (allKw ?? []) as { keywords: string[] }[]) for (const k of r.keywords ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  const keywordChips = ((kws ?? []) as { term: string }[])
    .map((k) => ({ term: k.term, count: counts.get(k.term) ?? 0 }))
    .filter((k) => k.count > 0 || k.term === f.kw) // palavra sem oferta não vira botão
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));

  const run = lastRun?.[0] as { source: string; ok: boolean | null; finished_at: string } | undefined;
  const topScore = Math.max(...offers.map((o) => o.score), 1);
  const filtered = isFiltered(f);
  const exportHref = hrefWith({ ...f, limit: PAGE_SIZE }, {}, "/api/export");

  return (
    <>
      <section className="hero">
        <div>
          <p className="comment">{"// meta · google · reclame aqui — brasil"}</p>
          <h1>Ofertas escalando no Brasil</h1>
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
            <>  <K>palavras_chave</K>: <N>{kws?.length ?? 0}</N>,</>,
            run ? (
              <>  <K>ultima_coleta</K>: <S>{fmtRun(run.finished_at)}</S>, <K>fonte</K>: <S>{run.source}</S>,</>
            ) : (
              <>  <K>ultima_coleta</K>: <span className="t-com">null</span>,</>
            ),
            <>  <K>status</K>: {run?.ok === false ? <span className="t-bad">&quot;com falha&quot;</span> : <span className="t-ok">&quot;online&quot;</span>}</>,
            <>{"}"}</>,
            <><span className="t-prompt">$</span> <Cursor /></>,
          ]}
        />
      </section>

      <Suspense>
        <FilterBar keywords={keywordChips} shown={offers.length} total={total} hiddenWeak={withWeak === null ? 0 : withWeak - total} exportHref={exportHref} />
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
              <SortTh f={f} k="desde" label="desde" title="Anúncio ativo mais antigo" />
              <th>pagina_de_vendas</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => (
              <tr key={o.offer_key}>
                <td className="gutter">{i + 1}</td>
                <td className="offer-cell">
                  <Thumb src={o.thumb_url} alt={`Criativo de ${o.advertiser}`} />
                  <div className="offer-main">
                    <Link className="offer-name" href={`/oferta/${encodeURIComponent(o.offer_key)}`}>{o.advertiser}</Link>
                    {o.domain && <span className="domain">{o.domain}</span>}
                    {o.pages > 1 && <div className="also">também em {o.advertisers.slice(1, 4).join(", ")}{o.advertisers.length > 4 ? "…" : ""}</div>}
                    {o.sample_text && <div className="snippet">{o.sample_text.slice(0, 120)}</div>}
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
                <td className="mono date">{fmtDate(o.oldest_start)}</td>
                <td className="landing">
                  {o.landing_url ? (
                    <span className="landing-wrap">
                      <a href={o.landing_url} target="_blank" rel="noreferrer noopener" title={o.landing_url}>{shortUrl(o.landing_url, 30)}</a>
                      <CopyButton text={o.landing_url} />
                    </span>
                  ) : (
                    <span className="dim mono">sem link</span>
                  )}
                  <div className="sublinks">
                    {o.page_url && <a href={o.page_url} target="_blank" rel="noreferrer" title="Página do anunciante no Facebook">página fb ↗</a>}
                    <a href={libraryLink(o.domain ?? o.advertiser)} target="_blank" rel="noreferrer" title="Anúncios ativos na Biblioteca da Meta">biblioteca ↗</a>
                  </div>
                </td>
              </tr>
            ))}
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
