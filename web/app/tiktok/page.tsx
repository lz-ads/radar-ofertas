import Link from "next/link";
import { countryName, db, flag, storageUrl } from "@/lib/db";
import { Thumb } from "../bits";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface TopAd {
  id: string; country: string; ad_title: string | null; brand_name: string | null; industry: string | null; industry_key: string | null;
  objective: string | null; likes: number | null; ctr: number | null; duration: number | null; cover_url: string | null; video_url: string | null;
  thumb_path: string | null; media_path: string | null; best_rank: number | null; first_seen: string; last_seen: string;
}

const SORTS = { curtidas: "likes", ctr: "ctr", novos: "first_seen", posicao: "best_rank" } as const;
type SortKey = keyof typeof SORTS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TikTok({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const pais = /^[A-Z]{2}$/.test(one(sp.pais).toUpperCase()) ? one(sp.pais).toUpperCase() : one(sp.pais) === "todos" ? "todos" : "BR";
  const sort = (Object.keys(SORTS).includes(one(sp.ordem)) ? one(sp.ordem) : "curtidas") as SortKey;
  const q = one(sp.q).replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  const recentes = one(sp.periodo) !== "tudo";
  const limit = Math.min(Number(one(sp.n)) || 60, 600);

  const client = db();
  let query = client.from("tiktok_top_ads").select("*", { count: "exact" })
    .order(SORTS[sort], { ascending: sort === "posicao", nullsFirst: false }).order("likes", { ascending: false }).limit(limit);
  if (pais !== "todos") query = query.eq("country", pais);
  if (recentes) query = query.gte("last_seen", new Date(Date.now() - 7 * 864e5).toISOString());
  if (q) query = query.or(`ad_title.ilike.%${q}%,brand_name.ilike.%${q}%,industry.ilike.%${q}%`);
  const [{ data, count, error }, { data: countries }, { data: lastRun }] = await Promise.all([
    query,
    client.from("tiktok_top_ads").select("country").limit(5000),
    client.from("runs").select("ok, items, message, finished_at").eq("source", "tiktok").order("id", { ascending: false }).limit(1),
  ]);
  const ads = (data ?? []) as TopAd[];
  const byCountry = new Map<string, number>();
  for (const r of (countries ?? []) as { country: string }[]) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  const run = lastRun?.[0] as { ok: boolean; items: number; message: string | null; finished_at: string } | undefined;
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { pais: pais === "BR" ? "" : pais, ordem: sort === "curtidas" ? "" : sort, q, periodo: recentes ? "" : "tudo" };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/tiktok?${s}` : "/tiktok";
  };
  const isNew = (d: string) => Date.now() - Date.parse(d) < 2 * 864e5;

  return (
    <>
      <p className="comment">{"// central de criativos do tiktok — anúncios em destaque"}</p>
      <h1>TikTok Top Ads</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Anúncios de leilão com melhor desempenho no TikTok, por país, lidos da Central de Criativos a cada coleta. Só aparecem os que o
        anunciante autorizou mostrar, então é uma amostra boa para garimpar ângulos e criativos, não a lista completa.
        {run && <> Última leitura: {new Date(run.finished_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{run.ok === false ? " (com falha — veja status.log)" : ""}.</>}
      </p>

      <section className="filterbar" aria-label="Filtros do TikTok">
        <div className="fb-row">
          <form className="search" action="/tiktok">
            <span className="kw" aria-hidden="true">WHERE</span>
            {pais !== "BR" && <input type="hidden" name="pais" value={pais} />}
            {sort !== "curtidas" && <input type="hidden" name="ordem" value={sort} />}
            {!recentes && <input type="hidden" name="periodo" value="tudo" />}
            <input type="search" name="q" defaultValue={q} placeholder="texto do anúncio, marca ou setor" aria-label="Buscar no texto do anúncio, marca ou setor" />
          </form>
        </div>
        <div className="fb-row">
          <div className="toggles" role="group" aria-label="País">
            {[...new Set(["BR", "US", ...byCountry.keys()])].map((c) => (
              <Link key={c} className="toggle" aria-pressed={pais === c} href={href({ pais: c === "BR" ? "" : c, n: null })}>
                {flag(c)} {countryName(c)} <span className="dim">{byCountry.get(c) ?? 0}</span>
              </Link>
            ))}
            <Link className="toggle" aria-pressed={pais === "todos"} href={href({ pais: "todos", n: null })}>🌎 todos</Link>
          </div>
        </div>
        <div className="fb-status">
          <span className="mono">
            ({ads.length}{count && count > ads.length ? ` de ${count}` : ""} anúncios) · ordenar:{" "}
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <Link key={k} className={`linkish${sort === k ? " on" : ""}`} style={{ marginLeft: 8 }} href={href({ ordem: k === "curtidas" ? "" : k, n: null })}>
                {{ curtidas: "curtidas", ctr: "CTR", novos: "mais novos", posicao: "posição" }[k]}
              </Link>
            ))}
          </span>
          <Link className="btn ghost" href={href({ periodo: recentes ? "tudo" : "", n: null })}>{recentes ? "Mostrar também os antigos" : "Só os desta semana"}</Link>
        </div>
      </section>

      {error && <div className="empty">Erro ao ler o banco: {error.message}. Se for tabela nova, rode a migração 006 no Supabase.</div>}

      <div className="tt-grid">
        {ads.map((a) => {
          const thumb = a.thumb_path ? storageUrl("criativos", a.thumb_path) : a.cover_url;
          const video = a.media_path ? storageUrl("midia", a.media_path) : null;
          return (
            <article key={a.id} className="tt-card">
              <div className="tt-media">
                <Thumb src={thumb} alt={`Anúncio do TikTok: ${a.ad_title?.slice(0, 60) ?? a.id}`} video />
                {a.best_rank && <span className="g-cap mono">#{a.best_rank}</span>}
                {isNew(a.first_seen) && <span className="tt-new mono">novo</span>}
                {video ? (
                  <a className="g-dl" href={`${video}?download=${encodeURIComponent(`tiktok-${a.id}.mp4`)}`} title="Baixar o vídeo" aria-label="Baixar o vídeo">⬇</a>
                ) : a.video_url ? (
                  <a className="g-dl ghost" href={a.video_url} target="_blank" rel="noreferrer" title="Abrir o vídeo no TikTok (o link expira)" aria-label="Abrir o vídeo">↗</a>
                ) : null}
              </div>
              <div className="tt-body">
                <div className="meta-line" style={{ marginTop: 0 }}>
                  {pais === "todos" && <span>{flag(a.country)}</span>}
                  {a.industry && <span>{a.industry}</span>}
                  {a.objective && <span className="dim">{a.objective}</span>}
                </div>
                {a.brand_name && <b className="tt-brand">{a.brand_name}</b>}
                <p className="tt-title">{a.ad_title || <span className="dim">(sem texto)</span>}</p>
                <div className="xray">
                  <span><b>{(a.likes ?? 0).toLocaleString("pt-BR")}</b> curtidas</span>
                  {a.ctr !== null && <span title="Índice de CTR da Central de Criativos (0 a 1: quanto maior, melhor)">CTR <b>{Number(a.ctr).toFixed(2).replace(".", ",")}</b></span>}
                  {a.duration && <span>{Math.round(Number(a.duration))}s</span>}
                </div>
                <div className="sublinks">
                  <a href={`https://ads.tiktok.com/business/creativecenter/topads/${a.id}/pc/pt?countryCode=${a.country}&period=30`} target="_blank" rel="noreferrer">ver na central ↗</a>
                  {a.ad_title && <a href={`/?pais=${a.country}&q=${encodeURIComponent(a.brand_name || a.ad_title.split(/[.!?\n]/)[0].slice(0, 40))}`}>buscar na meta</a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!ads.length && !error && (
        <div className="empty">
          Nenhum anúncio do TikTok ainda{recentes ? " nesta semana" : ""}. Eles entram na próxima coleta (etapa &ldquo;tiktok&rdquo;).
        </div>
      )}
      {count !== null && count > ads.length && (
        <div className="more">
          <Link className="btn ghost" href={href({ n: String(limit + 60) })} scroll={false}>Mostrar mais</Link>
        </div>
      )}
    </>
  );
}
