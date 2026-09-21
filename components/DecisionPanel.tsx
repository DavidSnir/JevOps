"use client";

import { useState } from "react";
import type { ChatDecision } from "@/lib/jev/types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function DecisionPanel({
  decision,
}: {
  decision: ChatDecision;
}) {
  const [open, setOpen] = useState(false);
  const gateLabel = decision.gate === "llm" ? "LLM" : "Jev";
  const latency =
    decision.gateLatencyMs ?? decision.jevLatencyMs;
  const status = decision.gateStatus ?? decision.jevStatus;
  const routeLabel =
    decision.route === "allow" ? "ALLOW → LLM" : "BLOCKED";
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-zinc-200 px-2 py-0.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {open ? "Hide gate decision" : "Show gate decision"}
      </button>
      {open && (
        <dl className="mt-2 space-y-1 rounded-lg bg-zinc-50 p-3 font-mono dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Gate</dt>
            <dd>{gateLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Intent</dt>
            <dd>{decision.intent}</dd>
          </div>
          {decision.intentConfidence != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Intent conf</dt>
              <dd>{pct(decision.intentConfidence)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Route</dt>
            <dd>{routeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Gate latency</dt>
            <dd>{latency} ms</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">LLM called</dt>
            <dd>{decision.llmCalled ? "Yes" : "No"}</dd>
          </div>
          {status === "error" && (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Gate status</dt>
              <dd>error (blocked)</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
