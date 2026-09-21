export interface EvalExample {
  id: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  expectedRelevant: boolean;
  expectedIntent: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface EvalPrediction {
  id: string;
  intent: string;
  intentConfidence: number | null;
  route: "allow" | "block";
  latencyMs: number;
}

export interface EvalMetrics {
  total: number;
  truePositives: number;
  trueNegatives: number;
  falseBlocks: number;
  falseAllows: number;
  /** (TP+TN)/total over binary allow/block decisions. */
  routingAccuracy: number;
  relevantRecall: number;
  relevantPrecision: number;
  falseBlockRate: number;
  falseAllowRate: number;
  intentCorrect: number;
  intentAccuracy: number;
  /** Blocks resting on a weak off_topic top (confidence < 0.6), for review. */
  weakBlocks: {
    id: string;
    message: string;
    intentConfidence: number | null;
  }[];
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
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function computeMetrics(
  examples: EvalExample[],
  predictions: EvalPrediction[],
): EvalMetrics {
  const byId = new Map(predictions.map((p) => [p.id, p]));
  let tp = 0,
    tn = 0,
    falseBlocks = 0,
    falseAllows = 0,
    intentCorrect = 0;
  const latencies: number[] = [];
  const weakBlocks: EvalMetrics["weakBlocks"] = [];
  const misclassified: EvalMetrics["misclassified"] = [];

  for (const ex of examples) {
    const pred = byId.get(ex.id);
    if (!pred) continue;
    latencies.push(pred.latencyMs);
    if (pred.intent === ex.expectedIntent) intentCorrect++;
    const predictedRelevant = pred.route === "allow";
    const row = {
      id: ex.id,
      message: ex.message,
      expectedRelevant: ex.expectedRelevant,
      intent: pred.intent,
      intentConfidence: pred.intentConfidence,
      route: pred.route,
    };
    if (predictedRelevant && ex.expectedRelevant) tp++;
    else if (!predictedRelevant && !ex.expectedRelevant) {
      tn++;
      if (pred.intentConfidence == null || pred.intentConfidence < 0.6) {
        weakBlocks.push({
          id: ex.id,
          message: ex.message,
          intentConfidence: pred.intentConfidence,
        });
      }
    } else if (!predictedRelevant && ex.expectedRelevant) {
      falseBlocks++;
      misclassified.push({ ...row, result: "false_block" });
    } else {
      falseAllows++;
      misclassified.push({ ...row, result: "false_allow" });
    }
  }

  const total = examples.length;
  const relevantTotal = examples.filter((e) => e.expectedRelevant).length;
  const irrelevantTotal = total - relevantTotal;
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    total,
    truePositives: tp,
    trueNegatives: tn,
    falseBlocks,
    falseAllows,
    routingAccuracy: total ? (tp + tn) / total : 0,
    relevantRecall: tp + falseBlocks ? tp / (tp + falseBlocks) : 0,
    relevantPrecision: tp + falseAllows ? tp / (tp + falseAllows) : 0,
    falseBlockRate: relevantTotal ? falseBlocks / relevantTotal : 0,
    falseAllowRate: irrelevantTotal ? falseAllows / irrelevantTotal : 0,
    intentCorrect,
    intentAccuracy: total ? intentCorrect / total : 0,
    weakBlocks,
    avgLatencyMs: latencies.length
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0,
    p50LatencyMs: percentile(sorted, 50),
    p95LatencyMs: percentile(sorted, 95),
    misclassified,
  };
}

export function formatSummary(m: EvalMetrics): string {
  const f = (n: number) => `${(n * 100).toFixed(1)}%`;
  return [
    "PlantPal Jev Evaluation",
    "",
    `Examples:              ${m.total}`,
    `Routing accuracy:      ${f(m.routingAccuracy)}`,
    `Relevant recall:       ${f(m.relevantRecall)}`,
    `Relevant precision:    ${f(m.relevantPrecision)}`,
    `False blocks:          ${f(m.falseBlockRate)}`,
    `False allows:          ${f(m.falseAllowRate)}`,
    `Intent accuracy:       ${f(m.intentAccuracy)}`,
    `Weak blocks (<60%):    ${m.weakBlocks.length}`,
    `Average latency:       ${Math.round(m.avgLatencyMs)}ms`,
    `p50 latency:           ${Math.round(m.p50LatencyMs)}ms`,
    `p95 latency:           ${Math.round(m.p95LatencyMs)}ms`,
  ].join("\n");
}
