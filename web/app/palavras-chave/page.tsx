import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function addKeyword(form: FormData) {
  "use server";
  const term = String(form.get("term") || "").trim().toLowerCase();
  if (term) await db().from("keywords").upsert({ term, active: true }, { onConflict: "term" });
  revalidatePath("/palavras-chave");
}

async function toggleKeyword(form: FormData) {
  "use server";
  await db().from("keywords").update({ active: form.get("active") === "true" }).eq("id", Number(form.get("id")));
  revalidatePath("/palavras-chave");
}

async function addIgnored(form: FormData) {
  "use server";
  const name = String(form.get("name") || "").trim();
  if (name) await db().from("ignored_advertisers").upsert({ name });
  revalidatePath("/palavras-chave");
}

export default async function PalavrasChave() {
  const client = db();
  const [{ data: kws }, { data: ign }] = await Promise.all([
    client.from("keywords").select("id, term, active").order("term"),
    client.from("ignored_advertisers").select("name").order("name"),
  ]);

  return (
    <div className="grid2">
      <div className="panel">
        <h1>Palavras-chave</h1>
        <p className="muted">O robô busca cada frase exata na Biblioteca da Meta (Brasil, anúncios ativos, mais vistos primeiro).</p>
        <form action={addKeyword} className="filters">
          <input name="term" placeholder="ex.: dor no joelho" required />
          <button>Adicionar</button>
        </form>
        <table>
          <tbody>
            {(kws ?? []).map((k: { id: number; term: string; active: boolean }) => (
              <tr key={k.id}>
                <td className={k.active ? "" : "muted"}>{k.term}</td>
                <td style={{ textAlign: "right" }}>
                  <form action={toggleKeyword}>
                    <input type="hidden" name="id" value={k.id} />
                    <input type="hidden" name="active" value={String(!k.active)} />
                    <button style={k.active ? { background: "transparent", color: "var(--muted)" } : undefined}>
                      {k.active ? "Pausar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Anunciantes ignorados</h3>
        <p className="muted">Marketplaces e grandes marcas que não são ofertas para modelar. O nome tem que ser igual ao da página no Facebook.</p>
        <form action={addIgnored} className="filters">
          <input name="name" placeholder="Nome da página" required />
          <button>Ignorar</button>
        </form>
        <p>{(ign ?? []).map((i: { name: string }) => <span key={i.name} className="chip">{i.name}</span>)}</p>
      </div>
    </div>
  );
}
