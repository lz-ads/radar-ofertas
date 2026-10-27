"use client";

import { useState } from "react";

/** Miniatura do criativo. Os links de imagem do Facebook expiram: se quebrar, some sem deixar ícone quebrado. */
export function Thumb({ src, alt, video }: { src: string | null; alt: string; video?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="thumb thumb-empty" aria-hidden="true">&lt;/&gt;</span>;
  return (
    <span className="thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      {video && <span className="play" aria-label="vídeo">▶</span>}
    </span>
  );
}

/** Copia um texto (ex.: link da página de vendas) e confirma no próprio botão. */
export function CopyButton({ text, label = "copiar link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* sem permissão de área de transferência: nada a fazer */
        }
      }}
      aria-label={done ? "Link copiado" : label}
      title={done ? "copiado" : label}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}
