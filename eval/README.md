# PlantPal evaluation

Live Jev benchmark. Requires `TYPESAFE_API_KEY`. Costs API calls — keep out of unit tests.

```bash
npm run eval
# single example or difficulty slice:
npx tsx eval/run-eval.ts --only=edge-005
```

## Method

- Each `dataset.json` example has a manual label: `expectedRelevant`, `expectedIntent`.
- Runner builds the same concise Jev state as `/api/chat` (last 4 messages + current).
- One Jev call per example: a single Choice. The top intent label drives routing
  (`off_topic` → block, anything else → allow); confidence is recorded but never gates.
- Labels are frozen before running. Do not relabel to agree with Jev.

## Metrics (`eval/metrics.ts`)

- routing accuracy = (TP+TN)/total over binary allow/block decisions.
- false-block rate = blocked relevant / total relevant — the most important metric.
- false-allow rate, relevant recall/precision, intent accuracy.
- weak blocks: correct `off_topic` blocks resting on a top under 60% confidence —
  review these to see what strict top-label routing costs.
- avg/p50/p95 Jev latency.
- `eval/results.json` feeds the `/eval` page (misclassification + weak-block tables).
