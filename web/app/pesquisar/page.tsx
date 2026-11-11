import Link from "next/link";
import { COUNTRIES, countryName, creativeSrc, daysLabel, db, flag, libraryLink, type OfferRow } from "@/lib/db";
import { groupAds, type SearchAdRow, type SearchRow } from "@/lib/pesquisa";
import { retrySearch, startSearch, trackSearch } from "../actions";
import { Thumb } from "../bits";
import { C, K, N, S, Terminal } from "../terminal";
import { AutoRefresh } from "./auto-refresh";
import { Groups } from "./groups";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
type RadarHit = Pick<OfferRow, "offer_key" | "advertiser" | "domain" | "score" | "ads_active" | "days_running" | "watched" | "thumb_path" | "thumb_url" | "country">;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string) => v.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATUS_TXT: Record<string, string> = { pendente: "na fila", rodando: "buscando", pronta: "pronta", erro: "erro" };
const googleLink = (domain: string, country: string) =>
  `https://adstransparency.google.com/?region=${encodeURIComponent(country)}&domain=${encodeURIComponent(domain)}`;

export default async function Pesquisar({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const id = Number(one(sp.id)) || null;
  const client = db();

  const [{ data: recentRaw, error }, { data: curRaw }, { data: adsRaw }] = await Promise.all([
    client.from("searches").select("*").neq("kind", "nicho").order("requested_at", { ascending: false }).limit(15),
    id ? client.from("searches").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    id ? client.from("search_ads").select("*").eq("search_id", id).order("position").limit(1000) : Promise.resolve({ data: [] }),
  ]);
  const recent = (recentRaw ?? []) as SearchRow[];
  const cur = curRaw as SearchRow | null;

  if (error) {
    return (
      <Terminal
        title="erro.log"
        lines={[
          <span key="e" className="t-bad">Erro ao ler as pesquisas: {error.message}</span>,
          <C key="c">{"// rode supabase/migrations/007_pesquisa.sql no SQL Editor do Supabase"}</C>,
        ]}
      />
    );
  }

  const groups = cur?.status === "pronta" ? groupAds((adsRaw ?? []) as SearchAdRow[]) : [];
  const site = cur?.kind === "site" ? cur.term : null;

  // o que o radar já conhece: ofertas do resultado e busca no banco pelo termo
  const keys = groups.map((g) => g.key);
  const term = cur ? clean(cur.term) : "";
  const [{ data: knownRaw }, { data: radarRaw }] = await Promise.all([
    keys.length ? client.from("offer_ranking").select("offer_key, score, watched").in("offer_key", keys) : Promise.resolve({ data: [] }),
    term
      ? client
          .from("offer_ranking")
          .select("offer_key, advertiser, domain, score, ads_active, days_running, watched, thumb_path, thumb_url, country")
          .eq("country", cur!.country)
          .or(site ? `domain.ilike.%${term}%,landing_url.ilike.%${term}%` : `advertiser.ilike.%${term}%,domain.ilike.%${term}%,sample_text.ilike.%${term}%,promise.ilike.%${term}%`)
          .order("score", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ]);
  const known = new Map(((knownRaw ?? []) as { offer_key: string; score: number; watched: boolean }[]).map((k) => [k.offer_key, k]));
  const radar = (radarRaw ?? []) as RadarHit[];

  const toSite = groups.filter((g) => g.siteMatch);
  const citing = groups.filter((g) => !g.siteMatch);
  const running = cur && (cur.status === "pendente" || cur.status === "rodando");
  const defaultCountry = cur?.country ?? "BR";

  return (
    <>
      <p className="comment">{"// busca na hora: anúncios ativos na Biblioteca da Meta"}</p>
      <h1>Pesquisar</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Digite uma palavra (ex.: <i>pagamento na entrega</i>) ou um site (ex.: <i>loja.com.br</i>). O robô liga, procura todos os anúncios
        ativos com aquilo na Biblioteca da Meta e agrupa por anunciante. Para site, também conta os anúncios dele no Google. Leva uns 2 minutos.
      </p>

      <section className="panel" style={{ marginBottom: 20 }}>
        <form action={startSearch} className="search-form">
          <input
            className="field"
            name="term"
            required
            minLength={2}
            maxLength={120}
            placeholder="palavra, frase ou site (loja.com.br)"
            aria-label="Palavra ou site"
            autoFocus={!cur}
          />
          <select className="field country-sel" name="country" defaultValue={defaultCountry} aria-label="País">
            {Object.entries(COUNTRIES).map(([c, v]) => <option key={c} value={c}>{v.flag} {v.name}</option>)}
          </select>
          <select className="field" name="match" defaultValue="exata" aria-label="Como buscar a frase" title="Só vale para palavras (site sempre busca o endereço)">
            <option value="exata">frase exata</option>
            <option value="qualquer">qualquer ordem</option>
          </select>
          <button className="btn">Pesquisar</button>
        </form>
        {one(sp.erro) === "termo" && <p className="warn mono" style={{ margin: "10px 0 0", fontSize: 13 }}>Digite pelo menos 2 letras.</p>}
        {one(sp.erro) === "banco" && <p className="warn mono" style={{ margin: "10px 0 0", fontSize: 13 }}>Não consegui criar a pesquisa: {one(sp.msg)}. Rodou a migração 007 no Supabase?</p>}
      </section>

      {id && !cur && <div className="empty">Pesquisa não encontrada (pode ter sido apagada depois de 30 dias).</div>}

      {cur && (
        <>
          <Terminal
            title={`pesquisa-${cur.id}.sh`}
            lines={[
              <span key="cmd">
                <span className="t-prompt">$</span> <span className="t-fn">radar pesquisar</span> <S>{cur.term}</S> <K>--pais</K> {cur.country}
                {cur.kind === "site" ? <> <K>--site</K></> : cur.match === "qualquer" ? <> <K>--qualquer-ordem</K></> : null}
              </span>,
              cur.status === "pendente" ? (
                <AutoRefresh key="w" since={cur.requested_at} label="ligando o robô no GitHub…" />
              ) : cur.status === "rodando" ? (
                <AutoRefresh key="w" since={cur.requested_at} label={cur.kind === "site" ? "lendo a Biblioteca da Meta e o Google…" : "lendo a Biblioteca da Meta…"} />
              ) : cur.status === "erro" ? (
                <span key="e" className="t-bad">✗ {cur.message ?? "a pesquisa falhou"}</span>
              ) : (
                <span key="ok">
                  <span className="t-ok">✓</span> <N>{cur.ads_found ?? 0}</N> anúncios ativos lidos · <N>{cur.offers_found ?? 0}</N> anunciantes
                  {cur.total_results ? <> · Meta mostra <N>{cur.total_results.replace(/\s*resultados?/i, "")}</N></> : null}
                  {cur.kind === "site" ? <> · Google <N>{cur.google_ads === null ? "?" : cur.google_ads.toLocaleString("pt-BR")}</N></> : null}
                  {cur.finished_at && cur.started_at ? <C> {`// ${Math.round((Date.parse(cur.finished_at) - Date.parse(cur.started_at)) / 1000)}s`}</C> : null}
                </span>
              ),
              ...(running && cur.message ? [<C key="m">{`// ${cur.message}`}</C>] : []),
              ...(running && !cur.message ? [<C key="t">{"// o robô liga em ~1 min e a busca leva mais 1 ou 2; pode sair da página, chega aviso no Telegram"}</C>] : []),
              ...(cur.status === "pronta" && cur.message ? [<C key="m">{`// ${cur.message}`}</C>] : []),
            ]}
          />

          <div className="search-actions">
            <a className="ext-link" href={libraryLink(cur.term, cur.country)} target="_blank" rel="noreferrer">abrir na Biblioteca da Meta ↗</a>
            {site && <a className="ext-link" href={googleLink(site, cur.country)} target="_blank" rel="noreferrer">abrir no Google ↗</a>}
            {!running && (
              <form action={retrySearch}>
                <input type="hidden" name="id" value={cur.id} />
                <button className="btn ghost">{cur.status === "erro" ? "tentar de novo" : "atualizar resultado"}</button>
              </form>
            )}
            <form action={trackSearch}>
              <input type="hidden" name="id" value={cur.id} />
              <button className="btn ghost" title={site ? "Adiciona o site à Espionagem: o robô busca ele a cada coleta e avisa criativo novo" : "Vira palavra-chave: o robô busca a cada coleta e as ofertas entram no ranking"}>
                {site ? "👁 espionar este site" : "＋ coletar sempre"}
              </button>
            </form>
          </div>

          {cur.status === "pronta" && (
            groups.length === 0 ? (
              <div className="empty">
                Nenhum anúncio ativo com <b>{cur.term}</b> em {countryName(cur.country)} agora.
                {site ? " Sites costumam aparecer só no link do anúncio; se a loja anuncia com outro nome, pesquise o nome da marca." : " Tente “qualquer ordem” ou uma palavra mais curta."}
              </div>
            ) : site ? (
              <>
                <h2>Levam para {site} <span className="dim mono" style={{ fontSize: 14 }}>[{toSite.length}]</span></h2>
                {toSite.length ? <Groups groups={toSite} known={known} country={cur.country} /> : <div className="empty" style={{ paddingTop: 10 }}>Nenhum anúncio ativo levando para o site. Abaixo, quem cita o endereço.</div>}
                {citing.length > 0 && (
                  <>
                    <h2>Outros anunciantes que citam {site} <span className="dim mono" style={{ fontSize: 14 }}>[{citing.length}]</span></h2>
                    <Groups groups={citing} known={known} country={cur.country} />
                  </>
                )}
              </>
            ) : (
              <>
                <h2>Anunciantes <span className="dim mono" style={{ fontSize: 14 }}>[{groups.length}]</span></h2>
                <Groups groups={groups} known={known} country={cur.country} />
              </>
            )
          )}

          {radar.length > 0 && (
            <>
              <h2>Já no radar <span className="dim mono" style={{ fontSize: 14 }}>[{radar.length}]</span></h2>
              <p className="muted" style={{ margin: "-6px 0 12px", fontSize: 14 }}>Ofertas que a coleta automática já acompanha e batem com a pesquisa.</p>
              <div className="grid" style={{ marginBottom: 28 }}>
                <table className="ranking">
                  <thead>
                    <tr><th>oferta</th><th className="n">score</th><th className="n">ativos</th><th>no_ar</th></tr>
                  </thead>
                  <tbody>
                    {radar.map((o) => (
                      <tr key={o.offer_key}>
                        <td className="offer-cell">
                          <Thumb src={creativeSrc(o.thumb_path, o.thumb_url)} alt={`Criativo de ${o.advertiser}`} />
                          <div className="offer-main">
                            <span className="flag" title={countryName(o.country)}>{flag(o.country)}</span>
                            <Link className="offer-name" href={`/oferta/${encodeURIComponent(o.offer_key)}`}>{o.advertiser}</Link>
                            {o.domain && <div className="domain" style={{ marginLeft: 0 }}>{o.domain}</div>}
                            {o.watched && <div className="meta-line"><span className="badge">👁 espionando</span></div>}
                          </div>
                        </td>
                        <td className="n">{o.score}</td>
                        <td className="n">{o.ads_active}</td>
                        <td className="mono date">{daysLabel(o.days_running)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <h2>Últimas pesquisas</h2>
      <div className="grid">
        <table className="ranking">
          <thead>
            <tr><th>busca</th><th>país</th><th>status</th><th className="n">anúncios</th><th className="n">anunciantes</th><th>quando</th></tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id} aria-current={s.id === cur?.id ? "true" : undefined}>
                <td>
                  <Link className="offer-name" href={`/pesquisar?id=${s.id}`}>{s.kind === "site" ? "🌐 " : ""}{s.term}</Link>
                  {s.kind === "palavra" && s.match === "qualquer" && <span className="dim mono" style={{ fontSize: 12 }}> (qualquer ordem)</span>}
                </td>
                <td><span title={countryName(s.country)}>{flag(s.country)}</span></td>
                <td><span className={`badge${s.status === "pronta" ? " ok" : s.status === "erro" ? " err" : ""}`}>{STATUS_TXT[s.status] ?? s.status}</span></td>
                <td className="n">{s.ads_found ?? "—"}</td>
                <td className="n">{s.offers_found ?? "—"}</td>
                <td className="mono date">{fmtWhen(s.requested_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length && <div className="empty">Nenhuma pesquisa ainda. Digite uma palavra ou site acima.</div>}
      </div>
    </>
  );
}
