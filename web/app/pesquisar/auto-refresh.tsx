"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Enquanto a pesquisa roda, recarrega os dados a cada 4 s e mostra o tempo de espera. */
export function AutoRefresh({ since, label }: { since: string; label: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      if (Date.now() - start > 20 * 60_000) return; // depois de 20 min para de insistir
      router.refresh();
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);
  const secs = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <span aria-live="polite">
      <span className="t-key">{label}</span> <span className="t-com">⏱ {t}</span> <span className="cursor" aria-hidden="true" />
    </span>
  );
}
