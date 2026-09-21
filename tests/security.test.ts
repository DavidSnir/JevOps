import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitForTests,
  capHistoryBudget,
  checkRateLimit,
  isCrossSiteRequest,
  isValidLlmBaseUrl,
} from "@/lib/security";
import { ROUTING_CONFIG } from "@/lib/routing-config";

beforeEach(() => __resetRateLimitForTests());

describe("checkRateLimit", () => {
  it("allows up to the configured max then blocks with Retry-After", () => {
    for (let i = 0; i < ROUTING_CONFIG.rateLimitMaxRequests; i++) {
      expect(checkRateLimit("test-ip").allowed).toBe(true);
    }
    const blocked = checkRateLimit("test-ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks buckets per key", () => {
    for (let i = 0; i < ROUTING_CONFIG.rateLimitMaxRequests; i++) {
      checkRateLimit("a");
    }
    expect(checkRateLimit("a").allowed).toBe(false);
    expect(checkRateLimit("b").allowed).toBe(true);
  });
});

describe("isCrossSiteRequest", () => {
  it("allows requests without an Origin header", () => {
    expect(
      isCrossSiteRequest(new Request("http://localhost/api/chat")),
    ).toBe(false);
  });

  it("allows same-origin browser POSTs", () => {
    expect(
      isCrossSiteRequest(
        new Request("http://localhost:3000/api/chat", {
          headers: { Origin: "http://localhost:3000" },
        }),
      ),
    ).toBe(false);
  });

  it("flags cross-site browser POSTs", () => {
    expect(
      isCrossSiteRequest(
        new Request("http://localhost/api/chat", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toBe(true);
  });
});

describe("capHistoryBudget", () => {
  it("drops oldest items until the budget fits", () => {
    const items = [
      { role: "user", content: "a".repeat(5000) },
      { role: "assistant", content: "b".repeat(5000) },
      { role: "user", content: "c".repeat(100) },
    ];
    const capped = capHistoryBudget(items, 8000);
    expect(capped.map((m) => m.content)).toEqual([
      "b".repeat(5000),
      "c".repeat(100),
    ]);
  });

  it("keeps everything under budget", () => {
    const items = [{ role: "user", content: "hi" }];
    expect(capHistoryBudget(items, 8000)).toEqual(items);
  });
});

describe("isValidLlmBaseUrl", () => {
  it("accepts the default and https providers", () => {
    expect(isValidLlmBaseUrl(undefined)).toBe(true);
    expect(isValidLlmBaseUrl("https://openrouter.ai/api/v1")).toBe(true);
    expect(isValidLlmBaseUrl("http://localhost:11434/v1")).toBe(true);
  });

  it("rejects dangerous values", () => {
    expect(isValidLlmBaseUrl("file:///etc/passwd")).toBe(false);
    expect(isValidLlmBaseUrl("https://user:pass@evil.example")).toBe(false);
    expect(isValidLlmBaseUrl("http://evil.example/v1")).toBe(false);
    expect(isValidLlmBaseUrl("not a url")).toBe(false);
  });
});
