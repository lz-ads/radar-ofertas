import { db, fmtDate } from "@/lib/db";
import { parseFilters, queryOffers } from "@/lib/query";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
  // evita que o Excel interprete o texto como fórmula
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Exporta o ranking filtrado (mesmos filtros da tela) em CSV para Excel/Planilhas. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseFilters(sp);
  const { offers, error } = await queryOffers(db(), f, 1000);
  if (error) return new Response(`Erro ao ler o banco: ${error.message}`, { status: 500 });

  const header = ["posicao", "oferta", "dominio", "pagina_de_vendas", "pagina_facebook", "score", "no_topo", "copias", "crescimento_7d", "paginas", "google_ads", "rodando_desde", "palavras_chave", "outras_paginas", "texto_do_anuncio"];
  const rows = offers.map((o, i) => [
    i + 1, o.advertiser, o.domain, o.landing_url, o.page_url, o.score, o.cards, o.copies,
    o.copies_7d === null ? "novo" : o.copies_growth, o.pages, o.google_ads, fmtDate(o.oldest_start),
    o.keywords, o.advertisers.slice(1), o.sample_text,
  ]);
  // separador ";" e BOM: abre certo no Excel em português
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="radar-ofertas-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
