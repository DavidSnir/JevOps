import { beforeEach, describe, expect, it, vi } from "vitest";

const gateMock = vi.fn();
const answerMock = vi.fn();

vi.mock("@/lib/llm/gate", () => ({
  classifyWithLlm: (...args: unknown[]) => gateMock(...args),
}));

vi.mock("@/lib/llm/client", () => ({
  answerPlantQuestion: (...args: unknown[]) => answerMock(...args),
}));

import { POST } from "@/app/api/chat-llm-gate/route";
import { __resetRateLimitForTests } from "@/lib/security";

function req(body: unknown) {
  return new Request("http://localhost/api/chat-llm-gate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
});

describe("POST /api/chat-llm-gate", () => {
  it("blocks off-topic requests without calling the answer model", async () => {
    gateMock.mockResolvedValue({
      intent: "off_topic",
      latencyMs: 120,
      status: "ok",
    });
    const data = await (
      await POST(req({ message: "Write Python", history: [] }))
    ).json();

    expect(data.decision.gate).toBe("llm");
    expect(data.decision.route).toBe("block");
    expect(answerMock).not.toHaveBeenCalled();
  });

  it("allows plant requests and calls the answer model once", async () => {
    gateMock.mockResolvedValue({
      intent: "plant_care",
      latencyMs: 100,
      status: "ok",
    });
    answerMock.mockResolvedValue({ text: "Water weekly.", offline: false });
    const data = await (
      await POST(req({ message: "How do I water basil?", history: [] }))
    ).json();

    expect(data.decision.route).toBe("allow");
    expect(answerMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the LLM gate fails", async () => {
    gateMock.mockResolvedValue({
      intent: "other_plant",
      latencyMs: 1,
      status: "error",
      error: "missing_llm_api_key",
    });
    answerMock.mockResolvedValue({ text: "Offline answer.", offline: true });
    const data = await (
      await POST(req({ message: "What about weekly?", history: [] }))
    ).json();

    expect(data.decision.route).toBe("block");
    expect(data.decision.gateStatus).toBe("error");
    expect(data.decision).not.toHaveProperty("gateError");
    expect(answerMock).not.toHaveBeenCalled();
  });

  it("never exposes gate error text to the client", async () => {
    gateMock.mockResolvedValue({
      intent: "other_plant",
      latencyMs: 1,
      status: "error",
      error: "llm_http_500",
    });
    const data = await (
      await POST(req({ message: "Hi", history: [] }))
    ).json();
    expect(JSON.stringify(data)).not.toMatch(/llm_http_500/);
  });

  it("rejects cross-site browser POSTs with 403", async () => {
    gateMock.mockResolvedValue({
      intent: "plant_care",
      latencyMs: 1,
      status: "ok",
    });
    const cross = new Request("http://localhost/api/chat-llm-gate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({ message: "Hi", history: [] }),
    });
    const res = await POST(cross);
    expect(res.status).toBe(403);
    expect(gateMock).not.toHaveBeenCalled();
  });
});
