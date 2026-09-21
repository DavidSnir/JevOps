export const ROUTING_CONFIG = {
  /** Jev model pinned for reproducible eval. Override with JEV_MODEL env. */
  jevModel: process.env.JEV_MODEL ?? "jev-1.13.0",
  /** Per-attempt timeout for the Jev call (ms). */
  jevTimeoutMs: 8000,
  /** Timeout for the main plant LLM answer (ms). */
  llmTimeoutMs: 30000,
  /** Timeout for the comparison LLM gate (ms). */
  llmGateTimeoutMs: 10000,
  /** Max recent messages (user+assistant) sent to Jev as context. */
  jevHistoryLimit: 4,
  /** Max history messages forwarded to the plant LLM. */
  llmHistoryLimit: 20,
  /** Max user message length. */
  maxMessageLength: 2000,
  /** Per-IP rate-limit window for the paid chat routes (ms). */
  rateLimitWindowMs: 60000,
  /** Max requests per IP per rate-limit window. DualChat sends 2 per message. */
  rateLimitMaxRequests: 30,
  /** Total history characters forwarded to models per request. */
  historyBudgetChars: 8000,
  /** Reject request bodies larger than this (bytes, via content-length). */
  maxBodyBytes: 100_000,
} as const;

export type RoutingConfig = typeof ROUTING_CONFIG;
