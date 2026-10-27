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
  const list = (kws ?? []) as { id: number; term: string; active: boolean }[];
  const active = list.filter((k) => k.active).length;

  return (
    <>
      <p className="comment">{"// o que o robô pesquisa a cada coleta"}</p>
      <h1>Palavras-chave</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Cada frase é buscada exatamente assim na Biblioteca da Meta, no Brasil, só entre anúncios ativos e começando pelos mais vistos.
        {" "}{active} de {list.length} estão ativas.
      </p>

      <div className="two-col">
        <section className="panel">
          <h2>Buscas</h2>
          <form action={addKeyword} className="inline-form">
            <input className="field" name="term" placeholder="ex.: dor no joelho" required aria-label="Nova palavra-chave" />
            <button className="btn">Adicionar</button>
          </form>
          <ul className="kw-list">
            {list.map((k) => (
              <li key={k.id}>
                <span className={`mono ${k.active ? "" : "off"}`}>&quot;{k.term}&quot;</span>
                <form action={toggleKeyword}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="active" value={String(!k.active)} />
                  <button className={k.active ? "btn ghost" : "btn"}>{k.active ? "Pausar" : "Ativar"}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Anunciantes ignorados</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Marketplaces e grandes marcas não são ofertas para modelar. Escreva o nome exatamente como aparece na página do Facebook.
          </p>
          <form action={addIgnored} className="inline-form">
            <input className="field" name="name" placeholder="Nome da página" required aria-label="Anunciante a ignorar" />
            <button className="btn">Ignorar</button>
          </form>
          <div className="chips">{(ign ?? []).map((i: { name: string }) => <span key={i.name} className="tag-kw">{i.name}</span>)}</div>
        </section>
      </div>
    </>
  );
}
