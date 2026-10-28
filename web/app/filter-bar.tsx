"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Opt = { value: string; label: string; count?: number };

interface Props {
  countries: Opt[];
  currencySymbol: string;
  keywords: { term: string; count: number }[];
  facets: { nicho: Opt[]; tipo: Opt[]; destino: Opt[]; checkout: Opt[] };
  shown: number;
  total: number;
  hiddenWeak: number;
  exportHref: string;
}

const TOGGLES = [
  { key: "crescendo", label: "crescendo na semana" },
  { key: "novas", label: "novas (7 dias)" },
  { key: "google", label: "também no Google" },
  { key: "site", label: "com página de vendas" },
  { key: "cod", label: "pagamento na entrega" },
  { key: "vsl", label: "com VSL" },
  { key: "validadas", label: "validadas (30+ dias)" },
  { key: "esfriando", label: "esfriando" },
  { key: "espionadas", label: "👁 espionadas" },
] as const;

const PRICES = [50, 100, 200, 500];

const RISKS = [
  { value: "baixo", label: "risco baixo" },
  { value: "medio", label: "risco médio" },
  { value: "alto", label: "risco alto" },
];

const STATUS = [
  { value: "funil", label: "no meu funil" },
  { value: "favorita", label: "★ favoritas" },
  { value: "analisando", label: "analisando" },
  { value: "modelando", label: "modelando" },
  { value: "testando", label: "testando" },
  { value: "descartada", label: "descartadas" },
  { value: "todos", label: "incluir descartadas" },
];

/**
 * Barra de filtros ao vivo: cada mudança atualiza a URL (sem botão "Filtrar").
 * A busca espera o usuário parar de digitar; o resto aplica na hora.
 */
export function FilterBar({ countries, currencySymbol, keywords, facets, shown, total, hiddenWeak, exportHref }: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const push = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    p.delete("n"); // filtro novo volta para a primeira página
    const s = p.toString();
    start(() => router.replace(s ? `${path}?${s}` : path, { scroll: false }));
  };

  // busca com espera de 300 ms
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => push({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // atalho "/" para focar a busca, como em ferramentas de desenvolvedor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const kw = params.get("kw") ?? "";
  const SELECTS = ["nicho", "tipo", "destino", "checkout", "preco", "risco", "status"] as const;
  const pais = (params.get("pais") ?? "BR").toUpperCase() === "TODOS" ? "todos" : (params.get("pais") ?? "BR").toUpperCase();
  const anyFilter = !!(params.get("q") || kw || TOGGLES.some((t) => params.get(t.key)) || SELECTS.some((k) => params.get(k)));
  const todas = params.get("todas") === "1";

  const Select = ({ name, label, opts }: { name: string; label: string; opts: Opt[] }) => {
    const v = params.get(name) ?? "";
    return (
      <label className={`facet${v ? " on" : ""}`}>
        <span className="sr-only">{label}</span>
        <select value={v} onChange={(e) => push({ [name]: e.target.value || null })} aria-label={label}>
          <option value="">{label}</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}{o.count !== undefined ? ` (${o.count})` : ""}</option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <section className="filterbar" aria-label="Filtros" data-pending={pending || undefined}>
      <div className="fb-row">
        <label className="search">
          <span className="kw" aria-hidden="true">WHERE</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="anunciante, site, texto ou promessa"
            aria-label="Buscar anunciante, site, texto do anúncio ou promessa"
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
      </div>

      <div className="fb-row facets" role="group" aria-label="Filtrar por">
        {countries.length > 1 && (
          <label className={`facet country${pais !== "BR" ? " on" : ""}`}>
            <span className="sr-only">país</span>
            <select value={pais} onChange={(e) => push({ pais: e.target.value === "BR" ? null : e.target.value, kw: null })} aria-label="País">
              {countries.map((c) => (
                <option key={c.value} value={c.value}>{c.label}{c.count !== undefined ? ` (${c.count})` : ""}</option>
              ))}
              <option value="todos">🌎 todos os países</option>
            </select>
          </label>
        )}
        {facets.nicho.length > 0 && <Select name="nicho" label="nicho" opts={facets.nicho} />}
        {facets.tipo.length > 0 && <Select name="tipo" label="tipo" opts={facets.tipo} />}
        {facets.destino.length > 0 && <Select name="destino" label="destino" opts={facets.destino} />}
        {facets.checkout.length > 0 && <Select name="checkout" label="plataforma" opts={facets.checkout} />}
        <Select name="preco" label="preço" opts={PRICES.map((v) => ({ value: String(v), label: `até ${currencySymbol} ${v}` }))} />
        <Select name="risco" label="risco" opts={RISKS} />
        <Select name="status" label="funil" opts={STATUS} />
      </div>

      <div className="fb-row">
        <div className="toggles" role="group" aria-label="Mostrar só">
          {TOGGLES.map((t) => {
            const on = params.get(t.key) === "1";
            return (
              <button key={t.key} type="button" className="toggle" aria-pressed={on} onClick={() => push({ [t.key]: on ? null : "1" })}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fb-row">
        <div className="kw-chips" role="group" aria-label="Palavra-chave">
          <button type="button" className="kw-chip" aria-pressed={!kw} onClick={() => push({ kw: null })}>todas</button>
          {keywords.map((k) => (
            <button key={k.term} type="button" className="kw-chip" aria-pressed={kw === k.term} onClick={() => push({ kw: kw === k.term ? null : k.term })}>
              {k.term}<span className="count">{k.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fb-status">
        <span className="mono" aria-live="polite">
          {pending ? <span className="t-key">consultando…</span> : <>({shown === total ? total : `${shown} de ${total}`} {total === 1 ? "linha" : "linhas"})</>}
          {!pending && (todas ? (
            <button type="button" className="linkish" onClick={() => push({ todas: null })}>esconder sinal fraco</button>
          ) : hiddenWeak > 0 ? (
            <button type="button" className="linkish" onClick={() => push({ todas: "1" })} title="Ofertas com 1 anúncio, sem cópias, sem Google e sem crescimento">
              + {hiddenWeak} com sinal fraco ocultas
            </button>
          ) : null)}
        </span>
        <span className="fb-actions">
          {anyFilter && (
            <button type="button" className="btn ghost" onClick={() => { setQ(""); start(() => router.replace(path, { scroll: false })); }}>
              Limpar filtros
            </button>
          )}
          <a className="btn ghost" href={exportHref}>Exportar CSV</a>
        </span>
      </div>
    </section>
  );
}
