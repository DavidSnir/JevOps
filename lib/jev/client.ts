import { TypeSafeClient } from "@typesafe-ai/sdk";
import { ROUTING_CONFIG } from "../routing-config";

/**
 * Server-only Jev client factory.
 * Returns null when TYPESAFE_API_KEY is missing so callers can fail open to allow.
 * Never call from the browser — the key must stay server-side.
 */
export function createJevClient(): TypeSafeClient | null {
  if (typeof window !== "undefined") {
    throw new Error("createJevClient must only be called server-side.");
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  return new TypeSafeClient({
    apiKey,
    defaultModel: process.env.JEV_MODEL ?? ROUTING_CONFIG.jevModel,
    timeout: ROUTING_CONFIG.jevTimeoutMs,
  });
}

export function getJevModel(): string {
  return process.env.JEV_MODEL ?? ROUTING_CONFIG.jevModel;
}
