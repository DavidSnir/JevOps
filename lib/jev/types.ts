export const JEV_INTENTS = [
  "plant_health",
  "plant_care",
  "plant_identification",
  "plant_science",
  "gardening",
  "app_support",
  "other_plant",
  "off_topic",
] as const;

export type JevIntent = (typeof JEV_INTENTS)[number];

export function isValidIntent(value: unknown): value is JevIntent {
  return (
    typeof value === "string" &&
    (JEV_INTENTS as readonly string[]).includes(value)
  );
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface JevState {
  application: {
    name: "PlantPal";
    purpose: string;
  };
  allowed_domain: string[];
  recent_conversation: ChatHistoryItem[];
  current_user_message: string;
}

export type JevStatus = "ok" | "error";

export interface JevClassifyResult {
  intent: JevIntent;
  intentConfidence: number | null;
  intentProbabilities: Record<string, number> | null;
  latencyMs: number;
  status: JevStatus;
  model: string;
  error?: string;
}

export type Route = "allow" | "block";

export interface ChatDecision {
  gate: "jev" | "llm";
  intent: JevIntent;
  intentConfidence?: number | null;
  intentProbabilities?: Record<string, number> | null;
  route: Route;
  llmCalled: boolean;
  jevLatencyMs: number;
  jevStatus: JevStatus;
  gateLatencyMs?: number;
  gateStatus?: JevStatus;
}
