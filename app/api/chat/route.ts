import { NextResponse } from "next/server";
import { buildJevState, classifyWithJev } from "@/lib/jev/classify";
import type { ChatHistoryItem } from "@/lib/jev/types";
import {
  answerPlantQuestion,
  type LlmChatMessage,
} from "@/lib/llm/client";
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
// Keep total route latency under platform limits (Jev 8s + answer 30s worst).
export const maxDuration = 60;

const BLOCKED_MESSAGE =
  "I’m PlantPal, so I can help with plants, gardening, plant care, and using PlantPal.";

function sanitizeHistory(raw: unknown): ChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof m === "object" &&
        ((m as { role?: unknown }).role === "user" ||
          (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
    .slice(-ROUTING_CONFIG.llmHistoryLimit)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 2000),
    }));
}

export async function POST(req: Request) {
  // Same-origin guard: browser POSTs from other sites are rejected.
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  // Per-IP rate limit in front of the paid Jev + LLM calls.
  const rl = checkRateLimit(`chat:${getClientIp(req)}`);
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
    console.error("[chat] invalid LLM_BASE_URL");
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

  // 1. Build Jev state (last 4 messages + current).
  const jevState = buildJevState(trimmed, cleanHistory);

  // 2. Single Jev Choice: top intent label drives routing.
  //    Fail closed: a Jev error blocks instead of calling the answer LLM.
  const jev = await classifyWithJev(jevState, {
    timeoutMs: ROUTING_CONFIG.jevTimeoutMs,
  });
  if (jev.status === "error") {
    console.error("[chat] jev error:", jev.error ?? "unknown_error");
  }
  const route = jev.status === "error" ? "block" : decideRoute(jev.intent);

  const decision = {
    gate: "jev" as const,
    intent: jev.intent,
    intentConfidence: jev.intentConfidence,
    intentProbabilities: jev.intentProbabilities,
    route,
    llmCalled: route === "allow",
    jevLatencyMs: jev.latencyMs,
    jevStatus: jev.status,
  };

  // 3a. ALLOW → plant LLM (Nemotron via OpenRouter by default).
  if (route === "allow") {
    // Shared LLM history (do NOT send Jev's decision to the answer model).
    const llmHistory: LlmChatMessage[] = [
      ...cleanHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: trimmed },
    ];
    try {
      const { text } = await answerPlantQuestion(
        llmHistory,
        ROUTING_CONFIG.llmTimeoutMs,
      );
      return NextResponse.json({ answer: text, decision });
    } catch (err) {
      console.error("[chat] llm error:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: "Plant assistant is temporarily unavailable." },
        { status: 502, headers: { "Retry-After": "5" } },
      );
    }
  }

  // 3b. BLOCK → local deterministic reply, LLM never called.
  return NextResponse.json({ answer: BLOCKED_MESSAGE, decision });
}
