import type { ChatDecision } from "@/lib/jev/types";
import DecisionPanel from "./DecisionPanel";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  decision?: ChatDecision;
}

export default function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-green-600 text-white"
            : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.decision && (
          <DecisionPanel decision={message.decision} />
        )}
      </div>
    </div>
  );
}
