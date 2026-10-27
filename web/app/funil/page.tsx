import Link from "next/link";
import { creativeSrc, db, priceRange, STATUSES, STATUS_LABEL, type OfferRow, type Status } from "@/lib/db";
import { setStatus } from "../actions";
import { Thumb } from "../bits";

export const dynamic = "force-dynamic";

const NEXT: Partial<Record<Status, Status>> = { favorita: "analisando", analisando: "modelando", modelando: "testando" };

export default async function Funil() {
  const client = db();
  const { data, error } = await client
    .from("offer_ranking")
    .select("offer_key, advertiser, domain, score, copies, copies_growth, copies_7d, niche, price_min, price_max, thumb_path, thumb_url, status, note")
    .not("status", "is", null)
    .order("score", { ascending: false })
    .limit(500);
  // ofertas no funil que saíram do ranking (pararam de anunciar) continuam aparecendo
  const { data: notes } = await client.from("offer_notes").select("offer_key, status, note, updated_at").not("status", "is", null);
  if (error) return <p className="warn">Erro ao ler o banco: {error.message}</p>;

  const rows = (data ?? []) as OfferRow[];
  const live = new Set(rows.map((r) => r.offer_key));
  const gone = ((notes ?? []) as { offer_key: string; status: Status; note: string | null }[]).filter((n) => !live.has(n.offer_key));

  return (
    <>
      <p className="comment">{"// do achado ao teste"}</p>
      <h1>Funil de modelagem</h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        Marque ofertas com ☆ no ranking ou mude o status na página da oferta. As descartadas saem do ranking para não aparecerem de novo.
      </p>

      <div className="board">
        {STATUSES.map((s) => {
          const col = rows.filter((r) => r.status === s);
          const old = gone.filter((g) => g.status === s);
          return (
            <section key={s} className={`col s-${s}`} aria-label={STATUS_LABEL[s]}>
              <h2>{STATUS_LABEL[s]} <span className="dim mono">{col.length + old.length}</span></h2>
              {col.map((o) => (
                <article key={o.offer_key} className="card">
                  <Thumb src={creativeSrc(o.thumb_path, o.thumb_url)} alt={`Criativo de ${o.advertiser}`} />
                  <div className="card-body">
                    <Link className="offer-name" href={`/oferta/${encodeURIComponent(o.offer_key)}`}>{o.advertiser}</Link>
                    <div className="dim mono card-meta">
                      score {o.score}
                      {o.copies_7d !== null && o.copies_growth > 0 && <span className="up"> ▲{o.copies_growth}</span>}
                      {o.price_min !== null && <> · {priceRange(o.price_min, o.price_max)}</>}
                    </div>
                    {o.niche && <div className="dim card-meta">{o.niche}</div>}
                    {o.note && <p className="card-note">{o.note.slice(0, 140)}</p>}
                    {NEXT[s] && (
                      <form action={setStatus}>
                        <input type="hidden" name="key" value={o.offer_key} />
                        <button name="status" value={NEXT[s]} className="linkish" style={{ marginLeft: 0 }}>mover para {NEXT[s]} →</button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
              {old.map((g) => (
                <article key={g.offer_key} className="card gone">
                  <div className="card-body">
                    <Link className="offer-name" href={`/oferta/${encodeURIComponent(g.offer_key)}`}>{g.offer_key.slice(2)}</Link>
                    <div className="dim card-meta">parou de aparecer nas coletas</div>
                    {g.note && <p className="card-note">{g.note.slice(0, 140)}</p>}
                  </div>
                </article>
              ))}
              {!col.length && !old.length && <p className="dim empty-col">vazio</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
