import { describe, expect, it } from "vitest";
import { parseLlmGateIntent } from "@/lib/llm/gate";

describe("parseLlmGateIntent", () => {
  it("parses exact JSON", () => {
    expect(parseLlmGateIntent('{"intent":"off_topic"}')).toBe("off_topic");
  });

  it("parses chatty preamble and trailing text", () => {
    expect(
      parseLlmGateIntent(
        'Sure, here is my classification: {"intent":"plant_care"} Hope that helps.',
      ),
    ).toBe("plant_care");
  });

  it("parses fenced code blocks", () => {
    expect(
      parseLlmGateIntent('```json\n{"intent":"gardening"}\n```'),
    ).toBe("gardening");
  });

  it("parses single quotes and case variations", () => {
    expect(parseLlmGateIntent("{'intent':'Off_Topic'}")).toBe("off_topic");
  });

  it("rejects unknown labels and non-JSON", () => {
    expect(parseLlmGateIntent('{"intent":"not_a_label"}')).toBeNull();
    expect(parseLlmGateIntent("just some words")).toBeNull();
    expect(parseLlmGateIntent('{"intent":')).toBeNull();
  });
});
