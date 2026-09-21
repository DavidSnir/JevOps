import { choice, type EntryType, type TypeSafeClient } from "@typesafe-ai/sdk";
import { ROUTING_CONFIG } from "../routing-config";
import { createJevClient, getJevModel } from "./client";
import {
  isValidIntent,
  type ChatHistoryItem,
  type JevClassifyResult,
  type JevIntent,
  type JevState,
} from "./types";

export const PLANT_PURPOSE =
  "A chat assistant for plants, gardening and plant care.";

export const ALLOWED_DOMAIN = [
  "plant care",
  "plant health",
  "watering",
  "light",
  "soil",
  "fertilizer",
  "pests",
  "propagation",
  "gardening",
  "plant biology relevant to plant care",
  "PlantPal application support",
];

export const INTENT_INSTRUCTIONS =
  "Classify the user's current request, interpreted in conversation context, into exactly one plant-assistant intent.";

export const INTENT_CRITERIA: Record<JevIntent, string> = {
  plant_health:
    "Disease, pests, yellowing, rot, diagnosis, treatment, recovery of a plant.",
  plant_care:
    "Watering, light, soil, fertilizer, repotting, pruning, humidity, routine care.",
  plant_identification:
    "What plant is this, identifying a species or cultivar.",
  plant_science:
    "Botany or biology that helps plant care, e.g. photosynthesis, transpiration.",
  gardening:
    "Outdoor growing, beds, landscaping, compost, seasonal planting.",
  app_support: "How to use the PlantPal application itself, its features or limits.",
  other_plant:
    "Clearly plant-related but not fitting the labels above, e.g. photographing plants, pet safety of a plant, plant-adjacent household questions.",
  off_topic:
    "Not plant-related: software, sports, politics, math, travel, unrelated cooking, writing tasks, general knowledge with no plant connection. " +
    "Software or app-building tasks are off_topic even when plant-flavored, e.g. building an app that gives plant advice. " +
    "Only questions about using PlantPal itself are app_support.",
};

/**
 * Build the concise Jev state. Keeps only the last N messages, no UI metadata.
 */
export function buildJevState(
  message: string,
  history: ChatHistoryItem[] = [],
): JevState {
  const recent = history
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-ROUTING_CONFIG.jevHistoryLimit)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  return {
    application: { name: "PlantPal", purpose: PLANT_PURPOSE },
    allowed_domain: ALLOWED_DOMAIN,
    recent_conversation: recent,
    current_user_message: message,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface ClassifyOptions {
  client?: TypeSafeClient | null;
  model?: string;
  timeoutMs?: number;
}

/** Fallback result for Jev failures. The chat route treats status:error as block. */
function failOpen(
  model: string,
  started: number,
  error: string,
): JevClassifyResult {
  return {
    intent: "other_plant",
    intentConfidence: null,
    intentProbabilities: null,
    latencyMs: Date.now() - started,
    status: "error",
    model,
    error,
  };
}

/**
 * One Jev call asking a single Choice (intent). The top label drives routing;
 * confidence and the full distribution are exposed for the UI and eval.
 * Validates output; on any failure returns status:error (the route blocks).
 */
export async function classifyWithJev(
  state: JevState,
  opts: ClassifyOptions = {},
): Promise<JevClassifyResult> {
  const model = opts.model ?? getJevModel();
  const client = opts.client !== undefined ? opts.client : createJevClient();
  const started = Date.now();

  if (!client) {
    return failOpen(model, started, "missing_typesafe_api_key");
  }

  try {
    const response = await client.systemOne(
      {
        state: state as unknown as EntryType,
        model,
        questions: {
          intent: choice(INTENT_INSTRUCTIONS, { ...INTENT_CRITERIA }),
        },
      },
      opts.timeoutMs ? { timeout: opts.timeoutMs } : {},
    );
    const latencyMs = Date.now() - started;
    const rawIntent = response.answers.intent as {
      choice?: unknown;
      confidence?: unknown;
      probabilities?: unknown;
    };
    if (!isValidIntent(rawIntent?.choice)) {
      return {
        ...failOpen(model, started, "malformed_jev_output"),
        latencyMs,
      };
    }
    return {
      intent: rawIntent.choice,
      intentConfidence:
        typeof rawIntent?.confidence === "number"
          ? clamp01(rawIntent.confidence)
          : null,
      intentProbabilities:
        rawIntent?.probabilities &&
        typeof rawIntent.probabilities === "object"
          ? (rawIntent.probabilities as Record<string, number>)
          : null,
      latencyMs,
      status: "ok",
      model: response.model ?? model,
    };
  } catch (err) {
    return failOpen(
      model,
      started,
      err instanceof Error ? err.message.slice(0, 200) : "jev_error",
    );
  }
}
