import Link from "next/link";
import { db, fmtDate, libraryLink, type OfferRow } from "@/lib/db";
import { C, Cursor, K, N, S, Terminal } from "./terminal";

export const dynamic = "force-dynamic";

type Search = Promise<{ q?: string; kw?: string; ordem?: string; novas?: string }>;

const ORDERS: Record<string, { col: keyof OfferRow; label: string }> = {
  score: { col: "score", label: "score" },
  crescimento: { col: "copies_growth", label: "crescimento_7d" },
  copias: { col: "copies", label: "copias" },
  google: { col: "google_ads", label: "google_ads" },
};

const fmtRun = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Ranking({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const orderKey = ORDERS[sp.ordem ?? ""] ? (sp.ordem as string) : "score";
  const order = ORDERS[orderKey];
  const client = db();

  let query = client.from("offer_ranking").select("*").order(order.col, { ascending: false, nullsFirst: false }).limit(200);
  if (sp.kw) query = query.contains("keywords", [sp.kw]);
  const q = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (q) query = query.or(`advertiser.ilike.%${q}%,domain.ilike.%${q}%,sample_text.ilike.%${q}%`);
  if (sp.novas) query = query.gte("first_seen", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));

  const [{ data: rows, error }, { data: kws }, { data: lastRun }] = await Promise.all([
    query,
    client.from("keywords").select("term").eq("active", true).order("term"),
    client.from("runs").select("source, ok, finished_at, items").order("id", { ascending: false }).limit(1),
  ]);

  if (error) {
    return (
      <Terminal
        title="erro.log"
        lines={[<span key="e" className="t-bad">Erro ao ler o banco: {error.message}</span>, <C key="c">{"// confira as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel"}</C>]}
      />
    );
  }

  const offers = (rows ?? []) as OfferRow[];
  const run = lastRun?.[0] as { source: string; ok: boolean | null; finished_at: string } | undefined;
  const growing = offers.filter((o) => o.copies_growth > 0).length;
  const topScore = Math.max(...offers.map((o) => o.score), 1);
  const filtered = !!(sp.q || sp.kw || sp.novas);

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
            <>  <K>ofertas</K>: <N>{offers.length}</N>,</>,
            <>  <K>crescendo_7d</K>: <N>{growing}</N>,</>,
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

      <form className="query" role="search" aria-label="Filtrar ofertas">
        <span className="kw">SELECT</span><span className="op">*</span><span className="kw">FROM</span><span>ofertas</span>
        <span className="kw">WHERE</span>
        <input className="grow" name="q" placeholder="anunciante, site ou texto do anúncio" defaultValue={sp.q} aria-label="Buscar anunciante, site ou texto" />
        <span className="kw">AND</span><span className="op">palavra =</span>
        <select name="kw" defaultValue={sp.kw ?? ""} aria-label="Palavra-chave">
          <option value="">todas</option>
          {(kws ?? []).map((k: { term: string }) => <option key={k.term} value={k.term}>{k.term}</option>)}
        </select>
        <span className="kw">ORDER BY</span>
        <select name="ordem" defaultValue={orderKey} aria-label="Ordenar por">
          {Object.entries(ORDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="check"><input type="checkbox" name="novas" value="1" defaultChecked={!!sp.novas} /> só novas (7 dias)</label>
        <button className="btn">Filtrar</button>
        {filtered && <Link className="btn ghost" href="/">Limpar</Link>}
      </form>

      <div className="grid">
        <table>
          <thead>
            <tr>
              <th className="n" aria-label="Posição"></th>
              <th>oferta</th>
              <th className="n">score</th>
              <th className="n">no_topo</th>
              <th className="n">copias</th>
              <th className="n">7d</th>
              <th className="n">paginas</th>
              <th className="n">google</th>
              <th>desde</th>
              <th>palavras</th>
              <th><span className="sr-only">Links</span></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => (
              <tr key={o.offer_key}>
                <td className="gutter">{i + 1}</td>
                <td>
                  <Link className="offer-name" href={`/oferta/${encodeURIComponent(o.offer_key)}`}>{o.advertiser}</Link>
                  {o.domain && <span className="domain">{o.domain}</span>}
                  {o.pages > 1 && <div className="also">também em {o.advertisers.slice(1, 4).join(", ")}</div>}
                  {o.sample_text && <div className="snippet">{o.sample_text.slice(0, 150)}</div>}
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
                  {o.copies_7d === null ? (
                    <span className="delta new">novo</span>
                  ) : o.copies_growth > 0 ? (
                    <span className="delta up">▲ {o.copies_growth}</span>
                  ) : (
                    <span className="delta dim">{o.copies_growth}</span>
                  )}
                </td>
                <td className="n">{o.pages}</td>
                <td className="n">{o.google_ads ?? <span className="dim">—</span>}</td>
                <td className="mono" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(o.oldest_start)}</td>
                <td><div className="tags">{o.keywords.map((k) => <span key={k} className="tag-kw">{k}</span>)}</div></td>
                <td><a className="ext-link" href={libraryLink(o.domain ?? o.advertiser)} target="_blank" rel="noreferrer">Meta ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {offers.length === 0 && (
          <div className="empty">
            {filtered ? (
              <>Nenhuma oferta com esses filtros. <Link href="/">Limpar filtros</Link></>
            ) : (
              <>Ainda sem ofertas. Rode a coleta no GitHub em <code>Actions → Coletar ofertas → Run workflow</code>.</>
            )}
          </div>
        )}
      </div>
    </>
  );
}
