"use client";

import { zipSync } from "fflate";
import { useActionState, useState } from "react";
import { generateMyVersion, type MyVersionState } from "./actions";

/** Baixa um arquivo gerado no navegador (zip, markdown...). */
function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** "Baixar tudo": junta os vídeos e imagens guardados num .zip, direto no navegador. */
export function DownloadAll({ files, zipName }: { files: { url: string; name: string }[]; zipName: string }) {
  const [state, setState] = useState<string | null>(null);
  if (!files.length) return null;
  return (
    <button
      type="button"
      className="btn"
      disabled={!!state && state !== "pronto" && !state.startsWith("erro")}
      onClick={async () => {
        try {
          const out: Record<string, Uint8Array> = {};
          for (let i = 0; i < files.length; i++) {
            setState(`baixando ${i + 1}/${files.length}…`);
            const res = await fetch(files[i].url);
            if (!res.ok) continue;
            out[files[i].name] = new Uint8Array(await res.arrayBuffer());
          }
          setState("compactando…");
          // vídeo e imagem já são comprimidos: guarda sem recomprimir (bem mais rápido)
          const zip = zipSync(out, { level: 0 });
          saveBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), zipName);
          setState("pronto");
          setTimeout(() => setState(null), 2500);
        } catch (e) {
          setState(`erro: ${(e as Error).message}`);
        }
      }}
    >
      {state ?? `⬇ Baixar tudo (.zip · ${files.length})`}
    </button>
  );
}

/** Copia um texto longo e baixa em .md. */
export function TextActions({ text, fileName }: { text: string; fileName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="text-actions">
      <button
        type="button"
        className="btn ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sem permissão */
          }
        }}
      >
        {copied ? "✓ copiado" : "Copiar"}
      </button>
      <button type="button" className="btn ghost" onClick={() => saveBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), fileName)}>
        Baixar .md
      </button>
    </span>
  );
}

/** Formulário da "sua versão": a IA escreve página, ganchos e roteiros para o seu produto. */
export function MyVersionForm({ offerKey, defaults, hasVersion }: { offerKey: string; defaults: Record<string, string>; hasVersion: boolean }) {
  const [state, action, pending] = useActionState<MyVersionState, FormData>(generateMyVersion, { ok: true, message: "" });
  return (
    <form action={action} className="my-form">
      <input type="hidden" name="key" value={offerKey} />
      <label>
        <span>seu produto *</span>
        <input className="field" name="produto" required defaultValue={defaults.produto} placeholder="ex.: cinta modeladora pós-parto" />
      </label>
      <label>
        <span>marca</span>
        <input className="field" name="marca" defaultValue={defaults.marca} placeholder="ex.: Lux Body" />
      </label>
      <label>
        <span>preço</span>
        <input className="field" name="preco" defaultValue={defaults.preco} placeholder="ex.: R$ 147 ou 2 por R$ 197" />
      </label>
      <label>
        <span>idioma</span>
        <select className="field" name="idioma" defaultValue={defaults.idioma || "português do Brasil"}>
          <option>português do Brasil</option>
          <option>português de Portugal</option>
          <option>inglês dos EUA</option>
          <option>inglês britânico</option>
          <option>espanhol</option>
          <option>japonês</option>
        </select>
      </label>
      <label className="wide">
        <span>diferenciais (o que é verdade sobre o seu produto)</span>
        <textarea className="field" name="diferencial" rows={2} defaultValue={defaults.diferencial} placeholder="material, garantia, prazo de entrega, provas reais que você tem…" />
      </label>
      <label className="wide">
        <span>público</span>
        <input className="field" name="publico" defaultValue={defaults.publico} placeholder="ex.: mulheres 25–40 que tiveram filho no último ano" />
      </label>
      <div className="wide my-actions">
        <button className="btn" disabled={pending}>{pending ? "Escrevendo… (até 1 min)" : hasVersion ? "Reescrever minha versão" : "Escrever minha versão"}</button>
        {state.message && <span className={state.ok ? "up mono" : "warn mono"} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
