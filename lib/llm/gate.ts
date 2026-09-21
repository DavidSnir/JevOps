import { INTENT_CRITERIA } from "../jev/classify";
import {
  isValidIntent,
  type ChatHistoryItem,
  type JevIntent,
} from "../jev/types";
import { ROUTING_CONFIG } from "../routing-config";
import { chatCompletions, llmGateModel, type LlmChatMessage } from "./client";

export interface LlmGateResult {
  intent: JevIntent;
  latencyMs: number;
  status: "ok" | "error";
  error?: string;
}

const LABELS = Object.keys(INTENT_CRITERIA) as JevIntent[];
const GATE_PROMPT = [
  "You are a strict router for PlantPal, a plant and gardening assistant. You do not answer the user; you only classify.",
  "Do not reason. Do not explain your decision. Output one single line with no preamble.",
  "Classify the current user message, interpreted in conversation context, into exactly one intent.",
  "Default to off_topic unless the request is clearly about plants, gardening, plant care, plant health, plant science, or using PlantPal itself. A plain greeting such as 'Hi' is off_topic.",
  "Software, code, app-building, math, travel, sports, politics, or general knowledge with no plant connection is off_topic. Software or app-building tasks are off_topic even when plant-flavored, e.g. building an app that gives plant advice.",
  "Only questions about using PlantPal itself are app_support.",
  "Follow-up questions inherit context from the recent conversation (e.g. 'What about once a week?' after watering).",
  ...LABELS.map((label) => `${label}: ${INTENT_CRITERIA[label]}`),
  `Return ONLY JSON in this exact shape: {"intent":"${LABELS[0]}"}. No markdown, no explanation, no other text.`,
  `The intent must be one of: ${LABELS.join(", ")}.`,
].join("\n");

function extractIntentValue(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return (JSON.parse(cleaned) as { intent?: unknown }).intent;
  } catch {
    // Fall through to substring/regex extraction for chatty outputs.
  }
  const braceMatch = cleaned.match(/\{[^{}]*['"]intent['"][^{}]*\}/i);
  if (braceMatch) {
    try {
      return (JSON.parse(braceMatch[0]) as { intent?: unknown }).intent;
    } catch {
      // Fall through to regex extraction.
    }
    try {
      const singleNormalized = braceMatch[0].replace(/'/g, '"');
      return (JSON.parse(singleNormalized) as { intent?: unknown }).intent;
    } catch {
      // Fall through to regex extraction.
    }
  }
  const quoted = cleaned.match(/["']intent["']\s*:\s*["']([^"'{}]+)["']/i);
  if (quoted?.[1]) return quoted[1].trim();
  return null;
}

export function parseLlmGateIntent(text: string): JevIntent | null {
  const value = extractIntentValue(text);
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isValidIntent(normalized) ? normalized : null;
}

function parseIntent(text: string): JevIntent | null {
  return parseLlmGateIntent(text);
}

/** LLM comparison gate. Failures return status:error; the route fails closed. */
export async function classifyWithLlm(
  message: string,
  history: ChatHistoryItem[] = [],
  timeoutMs = ROUTING_CONFIG.llmGateTimeoutMs,
): Promise<LlmGateResult> {
  const started = Date.now();
  try {
    const recent: LlmChatMessage[] = history
      .slice(-ROUTING_CONFIG.jevHistoryLimit)
      .map((item) => ({ role: item.role, content: item.content }));
    const text = await chatCompletions(
      [
        { role: "system", content: GATE_PROMPT },
        ...recent,
        { role: "user", content: message },
      ],
      timeoutMs,
      300,
      {
        temperature: 0,
        model: llmGateModel(),
        responseFormat: { type: "json_object" },
        excludeReasoning: true,
      },
    );
    const intent = parseIntent(text);
    if (!intent) {
      console.error(
        "[llm-gate] malformed output:",
        text.slice(0, 500),
      );
      throw new Error("malformed_llm_gate_output");
    }
    return { intent, latencyMs: Date.now() - started, status: "ok" };
  } catch (err) {
    return {
      intent: "other_plant",
      latencyMs: Date.now() - started,
      status: "error",
      error: err instanceof Error ? err.message.slice(0, 200) : "llm_gate_error",
    };
  }
}
