import { describe, expect, it } from "vitest";
import { decideRoute } from "@/lib/routing";
import { JEV_INTENTS } from "@/lib/jev/types";

describe("decideRoute", () => {
  it("blocks off_topic", () => {
    expect(decideRoute("off_topic")).toBe("block");
  });
  it("allows every plant intent", () => {
    for (const intent of JEV_INTENTS) {
      if (intent === "off_topic") continue;
      expect(decideRoute(intent)).toBe("allow");
    }
  });
});
