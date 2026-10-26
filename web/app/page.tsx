import Link from "next/link";
import { db, fmtDate, libraryLink, type OfferRow } from "@/lib/db";

export const dynamic = "force-dynamic";

type Search = Promise<{ q?: string; kw?: string; ordem?: string; novas?: string }>;

const ORDERS: Record<string, { col: keyof OfferRow; label: string }> = {
  score: { col: "score", label: "Score" },
  crescimento: { col: "copies_growth", label: "Crescimento 7 dias" },
  copias: { col: "copies", label: "Cópias do criativo" },
  google: { col: "google_ads", label: "Anúncios no Google" },
};

export default async function Ranking({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const order = ORDERS[sp.ordem ?? "score"] ?? ORDERS.score;
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
  if (error) return <p className="warn">Erro ao ler o banco: {error.message}</p>;
  const offers = (rows ?? []) as OfferRow[];
  const run = lastRun?.[0];
  const growing = offers.filter((o) => o.copies_growth > 0).length;

  return (
    <>
      <h1>Ofertas escalando no Brasil</h1>
      <p className="muted">
        Sinais de escala na Biblioteca da Meta (anúncios entre os mais vistos e cópias do mesmo criativo), crescimento contra 7 dias atrás e
        anúncios no Google.
      </p>

      <div className="stats">
        <div className="stat"><b>{offers.length}</b><span className="muted">ofertas na lista</span></div>
        <div className="stat"><b className="up">{growing}</b><span className="muted">crescendo na semana</span></div>
        <div className="stat">
          <b>{run ? new Date(run.finished_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}</b>
          <span className={run?.ok === false ? "warn" : "muted"}>última coleta {run ? `(${run.source}${run.ok === false ? ", com falha" : ""})` : ""}</span>
        </div>
      </div>

      <form className="filters">
        <input name="q" placeholder="Buscar anunciante, site ou texto" defaultValue={sp.q} />
        <select name="kw" defaultValue={sp.kw ?? ""}>
          <option value="">Todas as palavras-chave</option>
          {(kws ?? []).map((k: { term: string }) => <option key={k.term}>{k.term}</option>)}
        </select>
        <select name="ordem" defaultValue={sp.ordem ?? "score"}>
          {Object.entries(ORDERS).map(([k, v]) => <option key={k} value={k}>Ordenar: {v.label}</option>)}
        </select>
        <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="novas" value="1" defaultChecked={!!sp.novas} /> Só novas (7 dias)
        </label>
        <button>Filtrar</button>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="n">#</th>
              <th>Oferta</th>
              <th className="n">Score</th>
              <th className="n">No topo</th>
              <th className="n">Cópias</th>
              <th className="n">7 dias</th>
              <th className="n">Páginas</th>
              <th className="n">Google</th>
              <th>Rodando desde</th>
              <th>Encontrada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o, i) => (
              <tr key={o.offer_key}>
                <td className="n muted">{i + 1}</td>
                <td>
                  <Link href={`/oferta/${encodeURIComponent(o.offer_key)}`}><b>{o.advertiser}</b></Link>
                  {o.domain && <span className="muted"> · {o.domain}</span>}
                  {o.pages > 1 && <div className="muted" style={{ fontSize: 12 }}>também: {o.advertisers.slice(1, 4).join(", ")}</div>}
                  {o.sample_text && <div className="text">{o.sample_text.slice(0, 140)}</div>}
                </td>
                <td className="n"><b>{o.score}</b></td>
                <td className="n">{o.cards}</td>
                <td className="n">{o.copies}</td>
                <td className={`n ${o.copies_growth > 0 ? "up" : ""}`}>{o.copies_growth > 0 ? `+${o.copies_growth}` : o.copies_7d === null ? "novo" : o.copies_growth}</td>
                <td className="n">{o.pages}</td>
                <td className="n">{o.google_ads ?? "—"}</td>
                <td>{fmtDate(o.oldest_start)}</td>
                <td>{o.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</td>
                <td><a href={libraryLink(o.domain ?? o.advertiser)} target="_blank" rel="noreferrer">Meta ↗</a></td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr><td colSpan={11} className="muted">Nenhuma oferta ainda. Rode a coleta no GitHub Actions (Actions → Coletar ofertas → Run workflow).</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
