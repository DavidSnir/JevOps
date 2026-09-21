import { ROUTING_CONFIG } from "./routing-config";

/**
 * Shared request guards for the paid chat routes.
 *
 * NOTE: the rate limiter below is per-instance in-memory. It stops casual
 * abuse on a single instance; a multi-instance production deployment should
 * replace it with a shared store (Redis/Upstash) plus a daily spend cap.
 */

const buckets = new Map<string, number[]>();

/** Test-only reset for the in-memory buckets. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const windowMs = ROUTING_CONFIG.rateLimitWindowMs;
  const max = ROUTING_CONFIG.rateLimitMaxRequests;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const oldest = hits[0] ?? now;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * True when a browser POST arrives from a different origin.
 * Non-browser clients send no Origin header and are allowed through
 * (rate limiting still applies).
 */
export function isCrossSiteRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(req.url).origin;
  } catch {
    return false;
  }
}

/** Drop oldest items until total content length fits the budget. */
export function capHistoryBudget<T extends { content: string }>(
  items: T[],
  maxChars = ROUTING_CONFIG.historyBudgetChars,
): T[] {
  let total = items.reduce((sum, m) => sum + m.content.length, 0);
  let start = 0;
  while (total > maxChars && start < items.length) {
    total -= items[start]!.content.length;
    start += 1;
  }
  return items.slice(start);
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Reject dangerous LLM_BASE_URL values (wrong scheme, credentials in URL).
 * Any https host is allowed so self-hosted OpenAI-compatible providers keep
 * working; http is allowed only for localhost development.
 */
export function isValidLlmBaseUrl(raw: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(raw ?? DEFAULT_BASE_URL);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    );
  }
  return false;
}
