/** Kit de modelagem: tipos, prompt da "sua versão" e exportação em Markdown. */

export interface KitStructure {
  resumo?: string;
  publico?: string;
  promessa?: string;
  mecanismo?: string;
  angulo?: string;
  secoes?: { tipo: string; titulo: string; resumo: string }[];
  oferta?: { kits?: { nome: string; preco: string }[]; bonus?: string[]; garantia?: string; frete?: string; pagamento?: string; escassez?: string };
  provas?: string[];
  objecoes?: string[];
  ctas?: string[];
  funil?: string;
  ideias_de_teste?: string[];
}

export interface MyInput {
  produto: string;
  preco: string;
  diferencial: string;
  publico: string;
  idioma: string;
  marca: string;
}

export interface Transcript {
  library_id?: string;
  transcript?: string | null;
  hook: string | null;
  structure: string | null;
  cta: string | null;
}

export function myVersionPrompt(o: {
  input: MyInput;
  structure: unknown;
  offer: Record<string, string | null> | null;
  adTexts: string[];
  transcripts: Transcript[];
}): string {
  const i = o.input;
  return [
    "Você é um copywriter de resposta direta. Um gestor de tráfego encontrou uma oferta que está escalando e quer testar a MESMA ESTRUTURA com o PRÓPRIO produto.",
    "Escreva a versão dele, com texto 100% original: não copie frases, nomes, marcas, depoimentos ou números da oferta de referência.",
    "Não invente provas, depoimentos, estudos ou números que ele não informou; onde precisar, deixe um marcador [INSERIR PROVA REAL].",
    "Evite promessas que reprovam anúncio (cura, resultado garantido, antes/depois exagerado, renda garantida).",
    `Escreva em ${i.idioma || "português do Brasil"}. Formato: Markdown com títulos.`,
    "",
    "Entregue, nesta ordem:",
    "## Página de vendas (seção por seção, seguindo a ordem da estrutura de referência; para cada seção: título, texto e indicação de imagem/vídeo)",
    "## Oferta (kits/preços sugeridos com base no preço informado, bônus, garantia, escassez honesta)",
    "## 10 ganchos para os 3 primeiros segundos de vídeo",
    "## 3 roteiros de vídeo de 30–45 s (cena a cena, com o que aparece e o que é falado)",
    "## 3 textos de anúncio (texto principal + título)",
    "## Checklist do teste (público, orçamento inicial sugerido em termos gerais, o que medir)",
    "",
    "PRODUTO DELE:",
    `- produto: ${i.produto}`,
    i.marca ? `- marca: ${i.marca}` : "",
    i.preco ? `- preço: ${i.preco}` : "",
    i.diferencial ? `- diferenciais: ${i.diferencial}` : "",
    i.publico ? `- público: ${i.publico}` : "",
    "",
    "ESTRUTURA DA OFERTA DE REFERÊNCIA (mapa feito pela IA):",
    o.structure ? JSON.stringify(o.structure).slice(0, 8000) : "(ainda sem mapa da página — use os anúncios abaixo)",
    "",
    o.offer ? `Leitura rápida: promessa "${o.offer.promise ?? ""}", mecanismo "${o.offer.mechanism ?? ""}", oferta "${o.offer.offer ?? ""}", público "${o.offer.audience ?? ""}".` : "",
    "",
    "ANÚNCIOS DE REFERÊNCIA (só para entender o ângulo; não copie):",
    ...o.adTexts.slice(0, 3).map((t, n) => `${n + 1}. ${t.slice(0, 500)}`),
    "",
    o.transcripts.length ? "VÍDEOS DE REFERÊNCIA (gancho → estrutura → chamada):" : "",
    ...o.transcripts.slice(0, 4).map((t) => `- ${t.hook ?? ""} | ${t.structure ?? ""} | ${t.cta ?? ""}`),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const list = (xs: string[] | undefined) => (xs?.length ? xs.map((x) => `- ${x}`).join("\n") : "- —");

/** Kit completo em Markdown (para baixar, colar no Notion/Docs ou mandar para a equipe). */
export function kitMarkdown(o: {
  name: string;
  key: string;
  domain: string | null;
  landing: string | null;
  panel: string;
  library: string;
  prices: string | null;
  platform: string | null;
  checkout: string | null;
  insight: Record<string, string | null> | null;
  structure: KitStructure | null;
  ads: { library_id: string; body: string | null; copies: number; cta: string | null; media: string | null }[];
  transcripts: Map<string, Transcript>;
  shot: string | null;
  myVersion: string | null;
}): string {
  const s = o.structure;
  const lines: string[] = [
    `# Kit de modelagem — ${o.name}`,
    "",
    `- site: ${o.domain ?? "—"}`,
    `- página de vendas: ${o.landing ?? "—"}`,
    o.shot ? `- print da página inteira: ${o.shot}` : "",
    `- no radar: ${o.panel}`,
    `- biblioteca da Meta: ${o.library}`,
    `- feita em: ${o.platform ?? "—"} · checkout: ${o.checkout ?? "—"} · preços: ${o.prices ?? "—"}`,
    "",
  ];
  if (o.insight) {
    lines.push("## Leitura rápida", "", `- público: ${o.insight.audience ?? "—"}`, `- promessa: ${o.insight.promise ?? "—"}`, `- mecanismo: ${o.insight.mechanism ?? "—"}`, `- oferta: ${o.insight.offer ?? "—"}`, `- risco de reprovação: ${o.insight.risk ?? "—"}`, "");
  }
  if (s) {
    lines.push("## Mapa da página", "", s.resumo ?? "", "", `**Ângulo:** ${s.angulo ?? "—"}`, "", "| # | bloco | título | o que faz |", "|---|---|---|---|");
    (s.secoes ?? []).forEach((x, n) => lines.push(`| ${n + 1} | ${x.tipo} | ${x.titulo.replace(/\|/g, "/")} | ${x.resumo.replace(/\|/g, "/")} |`));
    lines.push("", "## Oferta", "");
    for (const k of s.oferta?.kits ?? []) lines.push(`- ${k.nome}: ${k.preco}`);
    lines.push(`- bônus: ${(s.oferta?.bonus ?? []).join(", ") || "—"}`, `- garantia: ${s.oferta?.garantia || "—"}`, `- frete: ${s.oferta?.frete || "—"}`, `- pagamento: ${s.oferta?.pagamento || "—"}`, `- escassez: ${s.oferta?.escassez || "—"}`);
    lines.push("", "## Provas", "", list(s.provas), "", "## Objeções quebradas", "", list(s.objecoes), "", "## Botões", "", list(s.ctas), "", "## Funil", "", s.funil || "—", "", "## Ideias de teste", "", list(s.ideias_de_teste), "");
  }
  lines.push("## Anúncios", "");
  for (const a of o.ads) {
    const t = o.transcripts.get(a.library_id);
    lines.push(`### ${a.copies}× · https://www.facebook.com/ads/library/?id=${a.library_id}`, "");
    if (a.media) lines.push(`arquivo: ${a.media}`, "");
    if (a.body) lines.push(a.body, "");
    if (a.cta) lines.push(`botão: ${a.cta}`, "");
    if (t) lines.push(`**Gancho:** ${t.hook ?? "—"}`, "", `**Estrutura:** ${t.structure ?? "—"}`, "", `**Chamada:** ${t.cta ?? "—"}`, "", "**Transcrição:**", "", (t.transcript ?? "").trim(), "");
  }
  if (o.myVersion) lines.push("---", "", "# Minha versão (IA)", "", o.myVersion, "");
  return lines.filter((l, n, arr) => !(l === "" && arr[n - 1] === "")).join("\n");
}
