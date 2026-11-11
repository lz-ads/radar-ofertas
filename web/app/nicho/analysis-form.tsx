"use client";

import { useActionState } from "react";
import { analyzeNiche, type NicheAnalysisState } from "../actions";

/** Botão do raio-X do nicho: a IA lê o que o robô achou e escreve a análise (até 1 min). */
export function AnalysisForm({ id, has }: { id: number; has: boolean }) {
  const [state, action, pending] = useActionState<NicheAnalysisState, FormData>(analyzeNiche, { ok: true, message: "" });
  return (
    <form action={action} className="niche-ai-form">
      <input type="hidden" name="id" value={id} />
      <button className="btn" disabled={pending}>{pending ? "Analisando… (até 1 min)" : has ? "Refazer raio-X com IA" : "Gerar raio-X do nicho com IA"}</button>
      {state.message && <span className={state.ok ? "up mono" : "warn mono"} role="status">{state.message}</span>}
    </form>
  );
}
