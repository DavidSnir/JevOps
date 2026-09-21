import type { JevIntent } from "./jev/types";

export type RoutingDecision = "allow" | "block";

/**
 * Pure label routing on Jev's top intent. No thresholds, no fallback.
 *
 *  intent === "off_topic" → block (local reply, LLM never called)
 *  otherwise               → allow (call plant LLM)
 *
 * The top label rules at any confidence — weak off_topic tops block too.
 * Jev errors fail open to allow (classify returns other_plant on error).
 */
export function decideRoute(intent: JevIntent): RoutingDecision {
  return intent === "off_topic" ? "block" : "allow";
}
