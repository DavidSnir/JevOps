import { NextResponse } from "next/server";
import type { ChatHistoryItem } from "@/lib/jev/types";
import { answerPlantQuestion, type LlmChatMessage } from "@/lib/llm/client";
import { classifyWithLlm } from "@/lib/llm/gate";
import { decideRoute } from "@/lib/routing";
import { ROUTING_CONFIG } from "@/lib/routing-config";
import {
  capHistoryBudget,
  checkRateLimit,
  getClientIp,
  isCrossSiteRequest,
  isValidLlmBaseUrl,
} from "@/lib/security";

export const runtime = "nodejs";
// Keep total route latency under platform limits (gate 10s + answer 30s worst).
export const maxDuration = 60;

const BLOCKED_MESSAGE =
  "I’m PlantPal, so I can help with plants, gardening, plant care, and using PlantPal.";

function sanitizeHistory(raw: unknown): ChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { role: "user" | "assistant"; content: string } =>
        !!item &&
        typeof item === "object" &&
        ((item as { role?: unknown }).role === "user" ||
          (item as { role?: unknown }).role === "assistant") &&
        typeof (item as { content?: unknown }).content === "string",
    )
    .slice(-ROUTING_CONFIG.llmHistoryLimit)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }));
}

export async function POST(req: Request) {
  // Same-origin guard: browser POSTs from other sites are rejected.
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  // Per-IP rate limit in front of the paid gate + answer calls.
  const rl = checkRateLimit(`chat-llm-gate:${getClientIp(req)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  // Body-size guard before parsing attacker-controlled history.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > ROUTING_CONFIG.maxBodyBytes) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  // Operator misconfiguration must never exfiltrate the API key elsewhere.
  if (!isValidLlmBaseUrl(process.env.LLM_BASE_URL)) {
    console.error("[chat-llm-gate] invalid LLM_BASE_URL");
    return NextResponse.json(
      { error: "Plant assistant is temporarily unavailable." },
      { status: 502, headers: { "Retry-After": "5" } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { message, history } = (body ?? {}) as {
    message?: unknown;
    history?: unknown;
  };
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message must be a non-empty string." },
      { status: 400 },
    );
  }
  if (message.length > ROUTING_CONFIG.maxMessageLength) {
    return NextResponse.json(
      { error: `Message too long (max ${ROUTING_CONFIG.maxMessageLength}).` },
      { status: 400 },
    );
  }

  const cleanHistory = capHistoryBudget(sanitizeHistory(history));
  const trimmed = message.trim();
  const gate = await classifyWithLlm(trimmed, cleanHistory);
  // Fail closed: if the comparison gate cannot classify safely, do not call
  // the answer model. Successful classifications retain normal label routing.
  // The raw gate error is logged server-side only, never sent to the client.
  const route = gate.status === "error" ? "block" : decideRoute(gate.intent);
  if (gate.status === "error") {
    console.error("[chat-llm-gate] gate error:", gate.error ?? "unknown_error");
  }
  const decision = {
    gate: "llm" as const,
    intent: gate.intent,
    intentConfidence: null,
    intentProbabilities: null,
    route,
    llmCalled: route === "allow",
    jevLatencyMs: 0,
    jevStatus: gate.status,
    gateLatencyMs: gate.latencyMs,
    gateStatus: gate.status,
  };

  if (route === "block") {
    return NextResponse.json({ answer: BLOCKED_MESSAGE, decision });
  }

  const llmHistory: LlmChatMessage[] = [
    ...cleanHistory,
    { role: "user", content: trimmed },
  ];
  try {
    const { text } = await answerPlantQuestion(
      llmHistory,
      ROUTING_CONFIG.llmTimeoutMs,
    );
    return NextResponse.json({ answer: text, decision });
  } catch (err) {
    console.error(
      "[chat-llm-gate] answer error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Plant assistant is temporarily unavailable." },
      { status: 502, headers: { "Retry-After": "5" } },
    );
  }
}
