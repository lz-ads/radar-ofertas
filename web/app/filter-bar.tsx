"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

interface Props {
  keywords: { term: string; count: number }[];
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
] as const;

/**
 * Barra de filtros ao vivo: cada mudança atualiza a URL (sem botão "Filtrar").
 * A busca espera o usuário parar de digitar; o resto aplica na hora.
 */
export function FilterBar({ keywords, shown, total, hiddenWeak, exportHref }: Props) {
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
  const anyFilter = !!(params.get("q") || kw || TOGGLES.some((t) => params.get(t.key)));
  const todas = params.get("todas") === "1";

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
            placeholder="anunciante, site ou texto do anúncio"
            aria-label="Buscar anunciante, site ou texto do anúncio"
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
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
