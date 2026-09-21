export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const PLANT_SYSTEM_PROMPT =
  "You are PlantPal, an assistant specializing in plants, gardening, plant health and plant care. " +
  "Answer the user's plant-related question clearly and concisely.";

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

function llmBaseUrl(): string {
  return (
    process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1"
  ).replace(/\/+$/, "");
}

function llmModel(): string {
  return (
    process.env.LLM_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free"
  );
}

export function llmGateModel(): string {
  return process.env.LLM_GATE_MODEL ?? llmModel();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI-compatible chat completions call (default: Nemotron via OpenRouter).
 * Provider/model remain overridable via LLM_BASE_URL / LLM_MODEL env.
 */
export async function chatCompletions(
  messages: LlmChatMessage[],
  timeoutMs: number,
  maxTokens = 500,
  opts: {
    temperature?: number;
    model?: string;
    responseFormat?: { type: string };
    excludeReasoning?: boolean;
  } = {},
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("missing_llm_api_key");
  const res = await fetchWithTimeout(
    `${llmBaseUrl()}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter convention: identify the app for analytics/rate limits.
        "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
        "X-Title": "PlantPal",
      },
      body: JSON.stringify({
        model: opts.model ?? llmModel(),
        messages,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.5,
        ...(opts.responseFormat
          ? { response_format: opts.responseFormat }
          : {}),
        // OpenRouter reasoning controls: keep gate output to JSON-only content
        // instead of chain-of-thought in the message body. Ignored elsewhere.
        ...(opts.excludeReasoning
          ? {
              include_reasoning: false,
              reasoning: { exclude: true, effort: "none" },
            }
          : {}),
      }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`llm_http_${res.status}`);
  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string; reasoning?: unknown; reasoning_content?: unknown };
    }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("llm_empty_response");
  return content;
}

/** Offline-safe plant answer used when no LLM key is configured (dev/demo). */
function offlinePlantAnswer(userMessage: string): string {
  return (
    `Here's some general plant guidance related to "${userMessage.slice(0, 120)}": ` +
    "check light, water only when the top few centimeters of soil are dry, ensure drainage, " +
    "and look for pests or nutrient issues. " +
    "(Offline demo answer — configure LLM_API_KEY for full responses.)"
  );
}

export async function answerPlantQuestion(
  messages: LlmChatMessage[],
  timeoutMs = 30000,
): Promise<{ text: string; offline: boolean }> {
  if (!isLlmConfigured()) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return {
      text: offlinePlantAnswer(lastUser?.content ?? "your plant"),
      offline: true,
    };
  }
  const text = await chatCompletions(
    [{ role: "system", content: PLANT_SYSTEM_PROMPT }, ...messages],
    timeoutMs,
  );
  return { text, offline: false };
}
