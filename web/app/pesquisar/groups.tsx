import Link from "next/link";
import { creativeSrc, daysLabel, fmtDate, shortUrl } from "@/lib/db";
import { daysSince, type SearchAdRow, type SearchGroup } from "@/lib/pesquisa";
import { addWatch } from "../actions";
import { Thumb } from "../bits";

/** Anunciante do resultado; na pesquisa por nicho vem também com as palavras em que apareceu. */
type Group = SearchGroup & { terms?: string[]; newcomer?: boolean };

/** Lista de anunciantes do resultado, cada um com os anúncios ativos. */
export function Groups({ groups, known, country, anchor }: { groups: Group[]; known: Map<string, { score: number; watched: boolean }>; country: string; anchor?: string }) {
  return (
    <div className="search-groups">
      {groups.map((g, i) => {
        const k = known.get(g.key);
        const days = daysSince(g.oldest);
        const first = g.ads.slice(0, 3);
        const rest = g.ads.slice(3);
        return (
          <section className="panel search-group" key={g.key} id={anchor ? `${anchor}${i}` : undefined}>
            <div className="sg-head">
              <Thumb src={g.thumb ? creativeSrc(g.thumb.thumb_path, g.thumb.thumb_url) : null} alt={`Criativo de ${g.advertiser}`} video={g.thumb?.media_type === "video"} />
              <div className="offer-main">
                <span className="offer-name">{g.advertiser}</span>
                {g.domain && <div className="domain" style={{ marginLeft: 0 }}>{g.domain}</div>}
                <div className="meta-line">
                  <span>{g.ads.length} {g.ads.length === 1 ? "anúncio ativo" : "anúncios ativos"}</span>
                  <span>{g.copies} {g.copies === 1 ? "cópia" : "cópias"}</span>
                  {days !== null && <span title={`mais antigo desde ${fmtDate(g.oldest)}`}>{days === 0 ? "no ar desde hoje" : `no ar há ${daysLabel(days)}`}</span>}
                  {g.newcomer && <span className="badge kw" title="Começou há até 14 dias e já tem 5 ou mais cópias">🔥 entrando forte</span>}
                  {k && <span className="badge ok">no radar · score {k.score}</span>}
                  {k?.watched && <span className="badge">👁 espionando</span>}
                </div>
                {g.terms && g.terms.length > 0 && (
                  <div className="chips sg-terms" aria-label="Palavras do nicho em que aparece">
                    {g.terms.map((t) => <span className="badge cold" key={t}>{t}</span>)}
                  </div>
                )}
              </div>
              <div className="sg-actions">
                {k && <Link className="btn ghost" href={`/oferta/${encodeURIComponent(g.key)}`}>ver oferta</Link>}
                {!k?.watched && (
                  <form action={addWatch}>
                    <input type="hidden" name="term" value={g.domain ?? g.advertiser} />
                    <input type="hidden" name="country" value={country} />
                    <button className="btn ghost" title="O robô busca este anunciante a cada coleta e avisa criativo novo no Telegram">👁 espionar</button>
                  </form>
                )}
                {g.landing && <a className="ext-link" href={g.landing} target="_blank" rel="noreferrer noopener" title={g.landing}>{shortUrl(g.landing, 30)} ↗</a>}
              </div>
            </div>
            <div className="sg-ads">
              {first.map((a) => <Ad a={a} key={a.library_id} />)}
              {rest.length > 0 && (
                <details>
                  <summary className="mono">ver mais {rest.length} {rest.length === 1 ? "anúncio" : "anúncios"}</summary>
                  {rest.map((a) => <Ad a={a} key={a.library_id} />)}
                </details>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Ad({ a }: { a: SearchAdRow }) {
  return (
    <article className="ad">
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
        {a.body && <p>{a.body.length > 600 ? a.body.slice(0, 600) + "…" : a.body}</p>}
      </div>
    </article>
  );
}
