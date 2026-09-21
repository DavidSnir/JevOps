import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ResultsFile {
  model?: string;
  metrics?: {
    total: number;
    routingAccuracy: number;
    relevantRecall: number;
    falseBlockRate: number;
    falseAllowRate: number;
    intentAccuracy: number;
    weakBlocks: { id: string; message: string; intentConfidence: number | null }[];
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    misclassified: {
      id: string;
      message: string;
      expectedRelevant: boolean;
      intent: string;
      intentConfidence: number | null;
      route: string;
      result: string;
    }[];
  };
}

async function loadResults(): Promise<ResultsFile | null> {
  try {
    const raw = await readFile(
      join(process.cwd(), "eval", "results.json"),
      "utf8",
    );
    return JSON.parse(raw) as ResultsFile;
  } catch {
    return null;
  }
}

export default async function EvalPage() {
  const results = await loadResults();
  const m = results?.metrics;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const conf = (n: number | null) =>
    n == null ? "—" : `${Math.round(n * 100)}%`;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-green-700 hover:underline">
        ← Back to chat
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Jev Evaluation</h1>
        <p className="text-sm text-zinc-500">
          Model: {results?.model ?? "jev-1.13.0"} · Routing: top intent label
          (off_topic → block). Run{" "}
          <code className="font-mono">npm run eval</code> to refresh (requires
          TYPESAFE_API_KEY).
        </p>
      </div>
      {!m ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          No <code className="font-mono">eval/results.json</code> yet. Run{" "}
          <code className="font-mono">npm run eval</code> with a Jev key to
          generate metrics. The chat works without keys in offline demo mode.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Prompts", String(m.total)],
              ["Routing accuracy", pct(m.routingAccuracy)],
              ["Recall", pct(m.relevantRecall)],
              ["False blocks", pct(m.falseBlockRate)],
              ["False allows", pct(m.falseAllowRate)],
              ["Intent accuracy", pct(m.intentAccuracy)],
              ["Weak blocks", String(m.weakBlocks.length)],
              ["Avg latency", `${Math.round(m.avgLatencyMs)}ms`],
              ["p95 latency", `${Math.round(m.p95LatencyMs)}ms`],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-xs text-zinc-500">{k}</p>
                <p className="text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div>
            <h2 className="mb-2 text-lg font-medium">
              Misclassified ({m.misclassified.length})
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="p-2">Prompt</th>
                    <th className="p-2">Expected</th>
                    <th className="p-2">Intent</th>
                    <th className="p-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {m.misclassified.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="max-w-64 p-2">{row.message}</td>
                      <td className="p-2">
                        {row.expectedRelevant ? "relevant" : "irrelevant"}
                      </td>
                      <td className="p-2 font-mono">
                        {row.intent} {conf(row.intentConfidence)}
                      </td>
                      <td className="p-2 font-mono">{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {m.weakBlocks.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-medium">
                Weak blocks — off_topic top under 60% ({m.weakBlocks.length})
              </h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="p-2">Prompt</th>
                      <th className="p-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.weakBlocks.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="max-w-64 p-2">{row.message}</td>
                        <td className="p-2 font-mono">
                          {conf(row.intentConfidence)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
