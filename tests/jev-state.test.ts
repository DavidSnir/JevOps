import { describe, expect, it } from "vitest";
import { buildJevState } from "@/lib/jev/classify";

describe("buildJevState", () => {
  it("includes only the last 4 messages and the current message", () => {
    const history = [1, 2, 3, 4, 5, 6].map((n) => ({
      role: (n % 2 === 0 ? "assistant" : "user") as "user" | "assistant",
      content: `msg ${n}`,
    }));
    const state = buildJevState("current?", history);
    expect(state.current_user_message).toBe("current?");
    expect(state.recent_conversation).toHaveLength(4);
    expect(state.recent_conversation[0]!.content).toBe("msg 3");
    expect(state.application.name).toBe("PlantPal");
    expect(state.allowed_domain.length).toBeGreaterThan(0);
  });

  it("drops empty messages", () => {
    const state = buildJevState("hi", [
      { role: "user", content: "   " },
      { role: "user", content: "real" },
    ]);
    expect(state.recent_conversation).toHaveLength(1);
  });
});
