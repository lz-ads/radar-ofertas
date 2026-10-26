import { db, fmtDate } from "@/lib/db";

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

  return (
    <>
      <h1>Recém-cadastradas com mais reclamações</h1>
      <p className="muted">
        Empresas no Reclame Aqui há até 60 dias, coletado em {fmtDate(day ?? null)}. Mostra nichos com muita venda nova, mas também é onde
        aparecem as lojas-golpe — use como alerta, não como oferta para modelar.
      </p>
      <div className="tablewrap">
        <table>
          <thead><tr><th className="n">#</th><th>Empresa</th><th>Reputação</th><th className="n">Reclamações</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="n">{r.position}</td>
                <td>{r.name}</td>
                <td className={r.reputation === "Não Recomendada" ? "warn" : ""}>{r.reputation}</td>
                <td className="n">{r.complaints}</td>
                <td>{r.slug && <a href={`https://www.reclameaqui.com.br/empresa/${r.slug}/`} target="_blank" rel="noreferrer">abrir ↗</a>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="muted">Ainda sem coleta.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
