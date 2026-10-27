import type { ReactNode } from "react";

/** Bloco de terminal: cada linha entra em sequência na primeira carga (respeita "reduzir movimento"). */
export function Terminal({ title, lines }: { title: string; lines: ReactNode[] }) {
  return (
    <div className="terminal" role="group" aria-label={title}>
      <div className="terminal-bar" aria-hidden="true">
        <i /><i /><i /><span>{title}</span>
      </div>
      <pre>
        {lines.map((l, i) => (
          <span className="line" key={i} style={{ ["--i" as string]: i }}>{l}{"\n"}</span>
        ))}
      </pre>
    </div>
  );
}

export const K = ({ children }: { children: ReactNode }) => <span className="t-key">{children}</span>;
export const S = ({ children }: { children: ReactNode }) => <span className="t-str">&quot;{children}&quot;</span>;
export const N = ({ children }: { children: ReactNode }) => <span className="t-num">{children}</span>;
export const C = ({ children }: { children: ReactNode }) => <span className="t-com">{children}</span>;
export const Cursor = () => <span className="cursor" aria-hidden="true" />;
