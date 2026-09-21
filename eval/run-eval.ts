/**
 * Live Jev evaluation runner (requires TYPESAFE_API_KEY).
 * Usage: npm run eval
 *
 * Reads eval/dataset.json, calls Jev once per example (single Choice),
 * applies lib/routing.ts, writes eval/results.json, prints summary.
 * Do NOT run in unit tests — this incurs network/API usage.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJevState, classifyWithJev } from "../lib/jev/classify";
import { decideRoute } from "../lib/routing";
import {
  computeMetrics,
  formatSummary,
  type EvalExample,
  type EvalPrediction,
} from "./metrics";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const raw = await readFile(join(root, "eval", "dataset.json"), "utf8");
  const examples = JSON.parse(raw) as EvalExample[];
  const thresholdFilter = process.argv.find((a) => a.startsWith("--only="));
  const only = thresholdFilter ? thresholdFilter.split("=")[1] : null;
  const list = only
    ? examples.filter((e) => e.id === only || e.difficulty === only)
    : examples;

  console.log(`Evaluating ${list.length}/${examples.length} examples...`);
  const predictions: EvalPrediction[] = [];
  for (const ex of list) {
    const state = buildJevState(ex.message, ex.history);
    const result = await classifyWithJev(state);
    const route = decideRoute(result.intent);
    predictions.push({
      id: ex.id,
      intent: result.intent,
      intentConfidence: result.intentConfidence,
      route,
      latencyMs: result.latencyMs,
    });
    const conf =
      result.intentConfidence != null
        ? ` ${(result.intentConfidence * 100).toFixed(0)}%`
        : "";
    process.stdout.write(
      `${ex.id}: intent=${result.intent}${conf} route=${route} ${result.latencyMs}ms${result.status === "error" ? ` (jev error: ${result.error ?? "unknown"})` : ""}\n`,
    );
  }

  const metrics = computeMetrics(list, predictions);
  console.log("\n" + formatSummary(metrics));
  await writeFile(
    join(root, "eval", "results.json"),
    JSON.stringify(
      { model: process.env.JEV_MODEL ?? "jev-1.13.0", metrics, predictions },
      null,
      2,
    ),
  );
  console.log("\nWrote eval/results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
