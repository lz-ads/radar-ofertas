import { db, fmtDate } from "@/lib/db";
import { C, K, N, S, Terminal } from "../terminal";

export const dynamic = "force-dynamic";

interface Row { day: string; position: number; name: string; slug: string | null; reputation: string | null; complaints: number }

export default async function ReclameAqui() {
  const client = db();
  const { data: last } = await client.from("ra_new_companies").select("day").order("day", { ascending: false }).limit(1);
  const day = last?.[0]?.day as string | undefined;
  const { data } = day
    ? await client.from("ra_new_companies").select("*").eq("day", day).order("position")
    : { data: [] as Row[] };
  const rows = (data ?? []) as Row[];
  const bad = rows.filter((r) => r.reputation === "Não Recomendada").length;
  const total = rows.reduce((s, r) => s + r.complaints, 0);

  return (
    <>
      <section className="hero">
        <div>
          <p className="comment">{"// empresas no Reclame Aqui há até 60 dias"}</p>
          <h1>Lojas novas com mais reclamações</h1>
          <p className="lede">
            Mostra onde tem muita venda nova acontecendo, mas também é onde aparecem as lojas-golpe. Use como alerta de nicho, não como oferta
            para modelar.
          </p>
        </div>
        <Terminal
          title="reclame-aqui — zsh"
          lines={[
            <><span className="t-prompt">$</span> <span className="t-fn">ra.recemCadastradas</span>()</>,
            <>{"{"}</>,
            <>  <K>coletado_em</K>: <S>{fmtDate(day ?? null)}</S>,</>,
            <>  <K>empresas</K>: <N>{rows.length}</N>,</>,
            <>  <K>reclamacoes</K>: <N>{total.toLocaleString("pt-BR")}</N>,</>,
            <>  <K>nao_recomendadas</K>: <N>{bad}</N> <C>{"// sinal de golpe"}</C></>,
            <>{"}"}</>,
          ]}
        />
      </section>

      <div className="grid">
        <table>
          <thead>
            <tr>
              <th className="n" aria-label="Posição"></th>
              <th>empresa</th>
              <th>reputacao</th>
              <th className="n">reclamacoes</th>
              <th><span className="sr-only">Link</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="gutter">{r.position}</td>
                <td><span className="offer-name">{r.name}</span></td>
                <td className={r.reputation === "Não Recomendada" ? "rep-bad" : "muted"}>{r.reputation ?? "—"}</td>
                <td className="n">{r.complaints.toLocaleString("pt-BR")}</td>
                <td>{r.slug && <a className="ext-link" href={`https://www.reclameaqui.com.br/empresa/${r.slug}/`} target="_blank" rel="noreferrer">abrir ↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">Ainda sem coleta do Reclame Aqui.</div>}
      </div>
    </>
  );
}
