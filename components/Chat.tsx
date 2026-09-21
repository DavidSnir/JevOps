"use client";

import ChatMessage, { type UIMessage } from "./ChatMessage";

interface ChatPaneProps {
  title: string;
  description: string;
  accent: "green" | "violet";
  messages: UIMessage[];
  loading: boolean;
  error: string | null;
}

export default function Chat({
  title,
  description,
  accent,
  messages,
  loading,
  error,
}: ChatPaneProps) {
  return (
    <section className="flex min-h-[70vh] flex-1 flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div className="flex max-h-[55vh] flex-1 flex-col gap-3 overflow-y-auto">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              PlantPal is thinking…
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p
        className={`text-center text-xs ${
          accent === "green" ? "text-green-600" : "text-violet-600"
        }`}
      >
        Open “Show gate decision” to inspect the route.
      </p>
    </section>
  );
}
