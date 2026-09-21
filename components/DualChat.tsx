"use client";

import { useState } from "react";
import type { ChatDecision } from "@/lib/jev/types";
import Chat from "./Chat";
import ChatInput from "./ChatInput";
import type { UIMessage } from "./ChatMessage";

const EXAMPLES = [
  { label: "Plant related", prompt: "Why are my monstera leaves yellow?" },
  { label: "Borderline", prompt: "Can my cat eat pothos?" },
  { label: "Off topic", prompt: "Write me a Python script." },
];

const JEZ_ENDPOINT = "/api/chat";
const LLM_ENDPOINT = "/api/chat-llm-gate";

let idCounter = 0;
const nextId = () => `m${Date.now()}-${idCounter++}`;

function toPayloadHistory(messages: UIMessage[], current: UIMessage) {
  const full = [...messages, current]
    .filter((m) => m.content.trim().length > 0)
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
  // API expects {message, history} where history excludes current message.
  return full.slice(0, -1);
}

async function postToGate(
  endpoint: string,
  text: string,
  payloadHistory: { role: string; content: string }[],
): Promise<ChatDecision & { answer: string }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, history: payloadHistory }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? "Request failed.");
  }
  return { ...(data.decision as ChatDecision), answer: data.answer as string };
}

export default function DualChat() {
  const [activeTab, setActiveTab] = useState<"jev" | "llm">("jev");
  const [jevMessages, setJevMessages] = useState<UIMessage[]>([]);
  const [llmMessages, setLlmMessages] = useState<UIMessage[]>([]);
  const [jevLoading, setJevLoading] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [jevError, setJevError] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const busy = jevLoading || llmLoading;
  const isEmpty = jevMessages.length === 0 && llmMessages.length === 0;

  async function send(text: string) {
    const jevUserMsg: UIMessage = {
      id: nextId(),
      role: "user",
      content: text,
    };
    const llmUserMsg: UIMessage = {
      id: nextId(),
      role: "user",
      content: text,
    };
    // Each gate keeps its own independent history for a fair comparison.
    const jevHistory = toPayloadHistory(jevMessages, jevUserMsg);
    const llmHistory = toPayloadHistory(llmMessages, llmUserMsg);

    setJevMessages((prev) => [...prev, jevUserMsg]);
    setLlmMessages((prev) => [...prev, llmUserMsg]);
    setJevLoading(true);
    setLlmLoading(true);
    setJevError(null);
    setLlmError(null);

    const runPane = async (
      endpoint: string,
      payloadHistory: { role: string; content: string }[],
      setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
      setError: React.Dispatch<React.SetStateAction<string | null>>,
      setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    ) => {
      try {
        const result = await postToGate(endpoint, text, payloadHistory);
        const { answer, ...decision } = result;
        const assistantMsg: UIMessage = {
          id: nextId(),
          role: "assistant",
          content: answer,
          decision: decision as ChatDecision,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    };

    await Promise.all([
      runPane(JEZ_ENDPOINT, jevHistory, setJevMessages, setJevError, setJevLoading),
      runPane(LLM_ENDPOINT, llmHistory, setLlmMessages, setLlmError, setLlmLoading),
    ]);
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      {isEmpty && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => send(ex.prompt)}
              disabled={busy}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="font-medium">{ex.label}:</span> “{ex.prompt}”
            </button>
          ))}
        </div>
      )}
      <div role="tablist" aria-label="Gate comparison" className="grid grid-cols-2 gap-1 rounded-full border border-zinc-200 bg-white p-1 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
        <button
          role="tab"
          aria-selected={activeTab === "jev"}
          onClick={() => setActiveTab("jev")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "jev"
              ? "bg-green-600 text-white"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          Jev{jevLoading ? " • thinking…" : ""}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "llm"}
          onClick={() => setActiveTab("llm")}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "llm"
              ? "bg-violet-600 text-white"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          LLM{llmLoading ? " • thinking…" : ""}
        </button>
      </div>
      <div className="grid flex-1 gap-4 md:grid-cols-2">
        <div className={activeTab === "jev" ? "" : "hidden md:block"}>
          <Chat
            title="Jev gate"
            description="Typed System One classification before the answer model"
            accent="green"
            messages={jevMessages}
            loading={jevLoading}
            error={jevError}
          />
        </div>
        <div className={activeTab === "llm" ? "" : "hidden md:block"}>
          <Chat
            title="LLM gate"
            description="The configured generative model classifies before answering"
            accent="violet"
            messages={llmMessages}
            loading={llmLoading}
            error={llmError}
          />
        </div>
      </div>
      <ChatInput onSend={send} loading={busy} />
      <p className="text-center text-xs text-zinc-400">
        One message is sent to both gates with independent histories.
      </p>
    </div>
  );
}
