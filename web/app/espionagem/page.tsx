import Link from "next/link";
import { COUNTRIES, countryName, creativeSrc, daysLabel, db, flag, type OfferRow } from "@/lib/db";
import { addWatch, removeWatch } from "../actions";
import { Thumb } from "../bits";

export const dynamic = "force-dynamic";

interface Watch { id: number; offer_key: string | null; label: string; term: string; country: string; created_at: string }

export default async function Espionagem() {
  const client = db();
  const { data: rows } = await client.from("watchlist").select("id, offer_key, label, term, country, created_at").order("created_at", { ascending: false });
  const list = (rows ?? []) as Watch[];
  const keys = list.map((w) => w.offer_key).filter((k): k is string => !!k);
  const [{ data: offers }, { data: lastNew }] = await Promise.all([
    keys.length ? client.from("offer_ranking").select("*").in("offer_key", keys) : Promise.resolve({ data: [] }),
    keys.length ? client.from("ads").select("offer_key, first_seen").in("offer_key", keys).order("first_seen", { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const byKey = new Map(((offers ?? []) as OfferRow[]).map((o) => [o.offer_key, o]));
  const newest = new Map<string, string>();
  for (const a of (lastNew ?? []) as { offer_key: string; first_seen: string }[]) if (!newest.has(a.offer_key)) newest.set(a.offer_key, a.first_seen);

  return (
    <>
      <p className="comment">{"// concorrentes que o robô busca a cada coleta"}</p>
      <h1>Espionagem</h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        Cada item é buscado na Biblioteca da Meta em toda coleta, além das palavras-chave. Quando sair criativo novo, chega aviso no Telegram.
        Dá para espionar direto da página da oferta (botão 👁) ou adicionar um site/nome aqui.
      </p>

      <section className="panel" style={{ marginBottom: 20 }}>
        <h2>Adicionar</h2>
        <form action={addWatch} className="inline-form">
          <input className="field" name="term" placeholder="site (loja.com.br) ou nome da página no Facebook" required aria-label="Site ou nome da página" />
          <select className="field country-sel" name="country" defaultValue="BR" aria-label="País">
            {Object.entries(COUNTRIES).map(([c, v]) => <option key={c} value={c}>{v.flag} {v.name}</option>)}
          </select>
          <button className="btn">Espionar</button>
        </form>
      </section>

      <div className="grid">
        <table className="ranking">
          <thead>
            <tr>
              <th>alvo</th>
              <th className="n">score</th>
              <th className="n">ativos</th>
              <th className="n">novos_7d</th>
              <th className="n">30d+</th>
              <th>no_ar</th>
              <th>último_criativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => {
              const o = w.offer_key ? byKey.get(w.offer_key) : undefined;
              const last = w.offer_key ? newest.get(w.offer_key) : undefined;
              return (
                <tr key={w.id}>
                  <td className="offer-cell">
                    <Thumb src={o ? creativeSrc(o.thumb_path, o.thumb_url) : null} alt={`Criativo de ${w.label}`} />
                    <div className="offer-main">
                      <span className="flag" title={countryName(w.country)}>{flag(w.country)}</span>
                      {w.offer_key ? <Link className="offer-name" href={`/oferta/${encodeURIComponent(w.offer_key)}`}>{o?.advertiser ?? w.label}</Link> : <span className="offer-name">{w.label}</span>}
                      <div className="domain" style={{ marginLeft: 0 }}>busca: &quot;{w.term}&quot;</div>
                      {!w.offer_key && <div className="dim mono" style={{ fontSize: 12 }}>aguardando a próxima coleta encontrar a oferta</div>}
                      {o?.cooling && <div className="meta-line"><span className="badge cold">🧊 esfriando</span></div>}
                    </div>
                  </td>
                  <td className="n">{o?.score ?? "—"}</td>
                  <td className="n">{o?.ads_active ?? "—"}</td>
                  <td className="n">{o ? (o.new_ads_7d > 0 ? <span className="up">+{o.new_ads_7d}</span> : 0) : "—"}</td>
                  <td className="n">{o?.long_runners ?? "—"}</td>
                  <td className="mono date">{o ? daysLabel(o.days_running) : "—"}</td>
                  <td className="mono date">{last ? new Date(last).toLocaleDateString("pt-BR") : "—"}</td>
                  <td>
                    <form action={removeWatch}>
                      <input type="hidden" name="id" value={w.id} />
                      <button className="btn ghost" title="Parar de espionar">Parar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <div className="empty">Nenhum concorrente na espionagem ainda. Abra uma oferta e clique em 👁 espionar.</div>}
      </div>
    </>
  );
}
