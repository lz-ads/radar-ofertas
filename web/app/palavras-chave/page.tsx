import { revalidatePath } from "next/cache";
import { COUNTRIES, countryName, db, flag } from "@/lib/db";

export const dynamic = "force-dynamic";

async function addKeyword(form: FormData) {
  "use server";
  const term = String(form.get("term") || "").trim().toLowerCase();
  const country = String(form.get("country") || "BR").toUpperCase();
  if (term && /^[A-Z]{2}$/.test(country)) await db().from("keywords").upsert({ term, country, active: true }, { onConflict: "term,country" });
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
    client.from("keywords").select("id, term, active, country").order("term"),
    client.from("ignored_advertisers").select("name").order("name"),
  ]);
  const list = (kws ?? []) as { id: number; term: string; active: boolean; country: string | null }[];
  const active = list.filter((k) => k.active).length;
  const groups = new Map<string, typeof list>();
  for (const k of list) {
    const c = (k.country || "BR").toUpperCase();
    groups.set(c, [...(groups.get(c) ?? []), k]);
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === "BR" ? -1 : b[0] === "BR" ? 1 : a[0].localeCompare(b[0])));

  return (
    <>
      <p className="comment">{"// o que o robô pesquisa a cada coleta"}</p>
      <h1>Palavras-chave</h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        Cada frase é buscada exatamente assim na Biblioteca da Meta, no país escolhido, só entre anúncios ativos e começando pelos mais vistos.
        {" "}{active} de {list.length} estão ativas. Pause um país inteiro pausando as palavras dele.
      </p>

      <div className="two-col">
        <section className="panel">
          <h2>Buscas</h2>
          <form action={addKeyword} className="inline-form">
            <input className="field" name="term" placeholder="ex.: dor no joelho" required aria-label="Nova palavra-chave" />
            <select className="field country-sel" name="country" defaultValue="BR" aria-label="País da busca">
              {Object.entries(COUNTRIES).map(([c, v]) => <option key={c} value={c}>{v.flag} {c}</option>)}
            </select>
            <button className="btn">Adicionar</button>
          </form>
          {ordered.map(([c, items]) => (
            <div key={c} className="kw-group">
              <h3>{flag(c)} {countryName(c)} <span className="dim mono">{items.filter((k) => k.active).length}/{items.length}</span></h3>
              <ul className="kw-list">
                {items.map((k) => (
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
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Anunciantes ignorados</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Marketplaces e grandes marcas não são ofertas para modelar. Escreva o nome da página como aparece no Facebook ou um domínio (ex.: hypera.com.br). Parcerias do tipo &ldquo;Fulana com Marca&rdquo; também são ignoradas. Vale na hora para o ranking.
          </p>
          <form action={addIgnored} className="inline-form">
            <input className="field" name="name" placeholder="Nome da página ou domínio" required aria-label="Anunciante a ignorar" />
            <button className="btn">Ignorar</button>
          </form>
          <div className="chips">{(ign ?? []).map((i: { name: string }) => <span key={i.name} className="tag-kw">{i.name}</span>)}</div>
        </section>
      </div>
    </>
  );
}
