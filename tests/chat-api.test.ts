import { describe, expect, it, vi, beforeEach } from "vitest";

const classifyMock = vi.fn();
const answerMock = vi.fn();

vi.mock("@/lib/jev/classify", () => ({
  buildJevState: (message: string, history: unknown[]) => ({
    application: { name: "PlantPal", purpose: "test" },
    allowed_domain: [],
    recent_conversation: history,
    current_user_message: message,
  }),
  classifyWithJev: (...args: unknown[]) => classifyMock(...args),
}));

vi.mock("@/lib/llm/client", () => ({
  answerPlantQuestion: (...args: unknown[]) => answerMock(...args),
}));

import { POST } from "@/app/api/chat/route";
import { __resetRateLimitForTests } from "@/lib/security";

function req(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jevOk(intent: string, confidence = 0.9) {
  return {
    intent,
    intentConfidence: confidence,
    intentProbabilities: null,
    latencyMs: 70,
    status: "ok",
    model: "jev-1.13.0",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
});

describe("POST /api/chat", () => {
  it("rejects empty input with 400", async () => {
    const res = await POST(req({ message: "   ", history: [] }));
    expect(res.status).toBe(400);
  });

  it("blocked request never invokes main LLM", async () => {
    classifyMock.mockResolvedValue(jevOk("off_topic", 0.45));
    const res = await POST(req({ message: "Write a Python script", history: [] }));
    const data = await res.json();
    expect(data.decision.route).toBe("block");
    expect(data.decision.intent).toBe("off_topic");
    expect(data.decision.llmCalled).toBe(false);
    expect(answerMock).not.toHaveBeenCalled();
    expect(data.answer).toMatch(/PlantPal/);
  });

  it("blocks weak off_topic tops too (top label rules)", async () => {
    classifyMock.mockResolvedValue(jevOk("off_topic", 0.4));
    const res = await POST(
      req({ message: "Build me an app that gives plant advice", history: [] }),
    );
    const data = await res.json();
    expect(data.decision.route).toBe("block");
    expect(answerMock).not.toHaveBeenCalled();
  });

  it("allowed request invokes main LLM exactly once", async () => {
    classifyMock.mockResolvedValue(jevOk("plant_health"));
    answerMock.mockResolvedValue({ text: "Water less.", offline: false });
    const res = await POST(req({ message: "Yellow monstera leaves?", history: [] }));
    const data = await res.json();
    expect(data.decision.route).toBe("allow");
    expect(data.decision.llmCalled).toBe(true);
    expect(answerMock).toHaveBeenCalledTimes(1);
  });

  it("Jev failure fails closed to block (never calls the LLM)", async () => {
    classifyMock.mockResolvedValue({
      intent: "other_plant",
      intentConfidence: null,
      intentProbabilities: null,
      latencyMs: 5,
      status: "error",
      model: "jev-1.13.0",
      error: "missing_typesafe_api_key",
    });
    answerMock.mockResolvedValue({ text: "Plant answer.", offline: false });
    const res = await POST(
      req({ message: "What about once a week?", history: [] }),
    );
    const data = await res.json();
    expect(data.decision.route).toBe("block");
    expect(data.decision.jevStatus).toBe("error");
    expect(data.decision.llmCalled).toBe(false);
    expect(answerMock).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toMatch(/missing_typesafe_api_key/);
  });

  it("passes recent conversation history into Jev state", async () => {
    classifyMock.mockResolvedValue(jevOk("plant_care", 0.8));
    answerMock.mockResolvedValue({ text: "ok", offline: false });
    const history = [
      { role: "user", content: "How often should I water my monstera?" },
      { role: "assistant", content: "When top soil is dry." },
    ];
    await POST(req({ message: "What about once a week?", history }));
    expect(classifyMock).toHaveBeenCalledTimes(1);
    const stateArg = classifyMock.mock.calls[0]![0] as {
      recent_conversation: unknown[];
      current_user_message: string;
    };
    expect(stateArg.current_user_message).toBe("What about once a week?");
    expect(stateArg.recent_conversation).toHaveLength(2);
  });

  it("never leaks API keys in responses", async () => {
    classifyMock.mockResolvedValue(jevOk("plant_care", 0.8));
    answerMock.mockResolvedValue({ text: "ok", offline: false });
    const res = await POST(req({ message: "Water basil?", history: [] }));
    const text = await res.text();
    expect(text).not.toMatch(/sk-/);
    expect(text).not.toMatch(/TYPESAFE_API_KEY/);
    expect(text).not.toMatch(/LLM_API_KEY/);
  });
});
