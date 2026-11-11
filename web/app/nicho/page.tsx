import Link from "next/link";
import { COUNTRIES, countryName, daysLabel, db, DEST_LABEL, flag, type DestType } from "@/lib/db";
import { groupNiche, MAX_TERMS, nicheSummary } from "@/lib/nicho";
import type { SearchAdRow, SearchRow } from "@/lib/pesquisa";
import { rerunNiche, startNiche, trackNiche } from "../actions";
import { TextActions } from "../kit-client";
import { AutoRefresh } from "../pesquisar/auto-refresh";
import { Groups } from "../pesquisar/groups";
import { C, K, N, S, Terminal } from "../terminal";
import { AnalysisForm } from "./analysis-form";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a IA gera as palavras e o raio-X aqui

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATUS_TXT: Record<string, string> = { pendente: "na fila", rodando: "buscando", pronta: "pronta", erro: "erro" };
const EXAMPLES = ["bet / cassino online", "emagrecimento", "renda extra", "skincare"];
const exactLink = (term: string, country: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&search_type=keyword_exact_phrase&q=${encodeURIComponent(`"${term}"`)}`;

export default async function Nicho({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const id = Number(one(sp.id)) || null;
  const client = db();

  const [{ data: recentRaw, error }, { data: curRaw }, { data: adsRaw }] = await Promise.all([
    client.from("searches").select("*").eq("kind", "nicho").order("requested_at", { ascending: false }).limit(15),
    id ? client.from("searches").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    id ? client.from("search_ads").select("*").eq("search_id", id).order("position").limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const recent = (recentRaw ?? []) as SearchRow[];
  const cur = curRaw as SearchRow | null;

  if (error) {
    return (
      <Terminal
        title="erro.log"
        lines={[
          <span key="e" className="t-bad">Erro ao ler os nichos: {error.message}</span>,
          <C key="c">{"// rode supabase/migrations/008_nicho.sql no SQL Editor do Supabase"}</C>,
        ]}
      />
    );
  }

  const groups = cur?.status === "pronta" ? groupNiche((adsRaw ?? []) as SearchAdRow[]) : [];
  const sum = nicheSummary(groups);
  const keys = groups.map((g) => g.key);
  const { data: knownRaw } = keys.length
    ? await client.from("offer_ranking").select("offer_key, score, watched").in("offer_key", keys)
    : { data: [] };
  const known = new Map(((knownRaw ?? []) as { offer_key: string; score: number; watched: boolean }[]).map((k) => [k.offer_key, k]));

  const running = cur && (cur.status === "pendente" || cur.status === "rodando");
  const stats = cur?.term_stats ?? [];
  const terms = cur?.terms ?? stats.map((t) => t.term);
  const defaultCountry = cur?.country ?? "BR";
  const destTxt = sum.dest.map(([d, n]) => `${DEST_LABEL[d as DestType] ?? d} ${n}`).join(" · ");
  const ctaTxt = sum.cta.map(([c, n]) => `${c} ${n}`).join(" · ");

  return (
    <>
      <p className="comment">{"// mapa de um nicho inteiro: várias palavras, um resultado só"}</p>
      <h1>Nicho</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Digite um nicho (ex.: <i>bet / cassino online</i>). A IA transforma em até {MAX_TERMS} palavras que os anúncios desse nicho usam,
        o robô busca cada uma na Biblioteca da Meta e junta tudo por anunciante. Depois, a IA faz o raio-X do nicho. Leva de 5 a 12 minutos.
      </p>

      <section className="panel" style={{ marginBottom: 20 }}>
        <form action={startNiche}>
          <div className="search-form">
            <input className="field" name="niche" required minLength={2} maxLength={80} placeholder="nicho (ex.: bet / cassino online)" aria-label="Nicho" autoFocus={!cur} />
            <select className="field country-sel" name="country" defaultValue={defaultCountry} aria-label="País">
              {Object.entries(COUNTRIES).map(([c, v]) => <option key={c} value={c}>{v.flag} {v.name}</option>)}
            </select>
            <button className="btn">Mapear nicho</button>
          </div>
          <details className="niche-own">
            <summary className="mono">quero escolher as palavras (opcional)</summary>
            <textarea className="field" name="terms" rows={3} placeholder={"uma por linha ou separadas por vírgula, até 10\nex.: rodadas grátis, bônus de boas-vindas, saque via pix"} aria-label="Palavras do nicho" />
          </details>
        </form>
        <div className="niche-examples">
          <span className="dim mono">exemplos:</span>
          {EXAMPLES.map((e) => (
            <form action={startNiche} key={e}>
              <input type="hidden" name="niche" value={e} />
              <input type="hidden" name="country" value="BR" />
              <button className="badge as-btn">{e}</button>
            </form>
          ))}
        </div>
        {one(sp.erro) === "termo" && <p className="warn mono" style={{ margin: "10px 0 0", fontSize: 13 }}>Digite pelo menos 2 letras.</p>}
        {one(sp.erro) === "banco" && <p className="warn mono" style={{ margin: "10px 0 0", fontSize: 13 }}>Não consegui criar a pesquisa: {one(sp.msg)}. Rodou a migração 008 no Supabase?</p>}
      </section>

      {id && !cur && <div className="empty">Pesquisa não encontrada (pode ter sido apagada depois de 30 dias).</div>}
      {cur && cur.kind !== "nicho" && <div className="empty">Essa é uma pesquisa de palavra ou site: <Link href={`/pesquisar?id=${cur.id}`}>abrir em Pesquisar</Link>.</div>}

      {cur && cur.kind === "nicho" && (
        <>
          <Terminal
            title={`nicho-${cur.id}.sh`}
            lines={[
              <span key="cmd">
                <span className="t-prompt">$</span> <span className="t-fn">radar nicho</span> <S>{cur.term}</S> <K>--pais</K> {cur.country} <K>--palavras</K> <N>{terms.length}</N>
              </span>,
              cur.status === "pendente" ? (
                <AutoRefresh key="w" since={cur.requested_at} label="ligando o robô no GitHub…" />
              ) : cur.status === "rodando" ? (
                <AutoRefresh key="w" since={cur.requested_at} label={cur.message ? `lendo a Biblioteca da Meta · ${cur.message}…` : "lendo a Biblioteca da Meta…"} />
              ) : cur.status === "erro" ? (
                <span key="e" className="t-bad">✗ {cur.message ?? "a pesquisa falhou"}</span>
              ) : (
                <span key="ok">
                  <span className="t-ok">✓</span> <N>{sum.ads}</N> anúncios ativos · <N>{sum.advertisers}</N> anunciantes · <N>{sum.copies}</N> cópias
                  {cur.finished_at && cur.started_at ? <C> {`// ${Math.round((Date.parse(cur.finished_at) - Date.parse(cur.started_at)) / 60000)} min`}</C> : null}
                </span>
              ),
              ...(cur.status === "pronta" && groups.length
                ? [
                    <span key="c"><K>concentração</K>: os 5 maiores têm <N>{sum.concentration}%</N> das cópias <C>{sum.concentration >= 60 ? "// nicho dominado por poucos" : sum.concentration <= 30 ? "// nicho pulverizado" : "// concorrência média"}</C></span>,
                    <span key="n"><K>entrando_forte</K>: <N>{sum.newcomers}</N> <C>{"// começaram há até 14 dias com 5+ cópias"}</C></span>,
                    ...(destTxt ? [<span key="d"><K>destinos</K>: {destTxt}</span>] : []),
                    ...(ctaTxt ? [<span key="b"><K>botões</K>: {ctaTxt}</span>] : []),
                  ]
                : []),
              ...(cur.status === "pronta" && cur.message ? [<C key="m">{`// ${cur.message}`}</C>] : []),
              ...(cur.status === "pendente" && cur.message ? [<C key="m">{`// ${cur.message}`}</C>] : []),
              ...(running ? [<C key="t">{"// cada palavra leva ~1 min; pode sair da página, chega aviso no Telegram"}</C>] : []),
            ]}
          />

          <div className="search-actions">
            <form action={trackNiche}>
              <input type="hidden" name="id" value={cur.id} />
              <button className="btn ghost" disabled={!terms.length} title="As palavras viram palavras-chave: o robô busca a cada coleta e as ofertas entram no ranking e nos alertas">
                ＋ coletar sempre ({terms.length} palavras)
              </button>
            </form>
          </div>

          <h2>Palavras <span className="dim mono" style={{ fontSize: 14 }}>[{terms.length}]</span></h2>
          <div className="grid" style={{ marginBottom: 14 }}>
            <table className="ranking">
              <thead>
                <tr><th>palavra</th><th className="n">total na Meta</th><th className="n">lidos</th><th /></tr>
              </thead>
              <tbody>
                {terms.map((t) => {
                  const st = stats.find((x) => x.term === t);
                  return (
                    <tr key={t}>
                      <td className="mono">{t}</td>
                      <td className="n">{st?.error ? <span className="warn" title={st.error}>falhou</span> : st?.total?.replace(/\s*resultados?/i, "") ?? "—"}</td>
                      <td className="n">{st && !st.error ? st.ads : "—"}</td>
                      <td><a className="ext-link" href={exactLink(t, cur.country)} target="_blank" rel="noreferrer">abrir ↗</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!running && (
            <details className="panel niche-edit" style={{ marginBottom: 28 }}>
              <summary className="mono">editar palavras e buscar de novo</summary>
              <form action={rerunNiche}>
                <input type="hidden" name="id" value={cur.id} />
                <textarea className="field" name="terms" rows={4} defaultValue={terms.join("\n")} aria-label="Palavras do nicho (uma por linha)" />
                <button className="btn">Buscar de novo</button>
              </form>
            </details>
          )}

          {cur.status === "pronta" && groups.length > 0 && (
            <>
              <h2>Raio-X do nicho</h2>
              <section className="panel" style={{ marginBottom: 28 }}>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                  A IA lê os {Math.min(25, groups.length)} principais anunciantes e os textos dos anúncios e escreve: quem domina, quem está entrando,
                  ângulos e promessas, estrutura de oferta, brechas, riscos de política e próximos passos.
                </p>
                <AnalysisForm id={cur.id} has={!!cur.analysis} />
                {cur.analysis && (
                  <div className="md-out">
                    <div className="md-bar">
                      <span className="dim mono">{cur.analysis_model}{cur.analysis_at ? ` · ${fmtWhen(cur.analysis_at)}` : ""}</span>
                      <TextActions text={cur.analysis} fileName={`raio-x-${cur.term.replace(/[^a-z0-9]+/gi, "-")}.md`} />
                    </div>
                    <pre className="md">{cur.analysis}</pre>
                  </div>
                )}
              </section>

              <h2>Ranking do nicho <span className="dim mono" style={{ fontSize: 14 }}>[{groups.length}]</span></h2>
              <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 14 }}>
                Força = anúncios ativos + cópias + 5 × palavras em que o anunciante aparece (quem aparece em várias é player central do nicho).
              </p>
              <div className="grid" style={{ marginBottom: 28 }}>
                <table className="ranking">
                  <thead>
                    <tr><th>#</th><th>anunciante</th><th className="n">força</th><th className="n">ativos</th><th className="n">cópias</th><th className="n">palavras</th><th>no_ar</th></tr>
                  </thead>
                  <tbody>
                    {groups.slice(0, 30).map((g, i) => (
                      <tr key={g.key}>
                        <td className="mono dim">{i + 1}</td>
                        <td>
                          <a className="offer-name" href={`#g-${i}`}>{g.advertiser}</a>
                          {g.domain && <div className="domain" style={{ marginLeft: 0 }}>{g.domain}</div>}
                          {g.newcomer && <span className="badge kw">🔥 entrando forte</span>}
                          {known.has(g.key) && <span className="badge ok">no radar</span>}
                        </td>
                        <td className="n">{g.force}</td>
                        <td className="n">{g.ads.length}</td>
                        <td className="n">{g.copies}</td>
                        <td className="n" title={g.terms.join(", ")}>{g.terms.length}/{terms.length}</td>
                        <td className="mono date">{daysLabel(g.days)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2>Anúncios por anunciante</h2>
              <Groups groups={groups} known={known} country={cur.country} anchor="g-" />
            </>
          )}
          {cur.status === "pronta" && groups.length === 0 && (
            <div className="empty">Nenhum anúncio ativo com essas palavras em {countryName(cur.country)} agora. Edite as palavras (mais curtas ou mais comuns) e busque de novo.</div>
          )}
        </>
      )}

      <h2>Últimos nichos</h2>
      <div className="grid">
        <table className="ranking">
          <thead>
            <tr><th>nicho</th><th>país</th><th>status</th><th className="n">palavras</th><th className="n">anúncios</th><th className="n">anunciantes</th><th>quando</th></tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id} aria-current={s.id === cur?.id ? "true" : undefined}>
                <td>
                  <Link className="offer-name" href={`/nicho?id=${s.id}`}>{s.term}</Link>
                  {s.analysis && <span className="dim mono" style={{ fontSize: 12 }}> · raio-X</span>}
                </td>
                <td><span title={countryName(s.country)}>{flag(s.country)}</span></td>
                <td><span className={`badge${s.status === "pronta" ? " ok" : s.status === "erro" ? " err" : ""}`}>{STATUS_TXT[s.status] ?? s.status}</span></td>
                <td className="n">{s.terms?.length ?? "—"}</td>
                <td className="n">{s.ads_found ?? "—"}</td>
                <td className="n">{s.offers_found ?? "—"}</td>
                <td className="mono date">{fmtWhen(s.requested_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length && <div className="empty">Nenhum nicho mapeado ainda. Digite um nicho acima.</div>}
      </div>
    </>
  );
}
