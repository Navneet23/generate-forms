"use client";

import { useEffect, useRef, useState } from "react";
import { FormStructure } from "@/lib/scraper";
import { HistoryTurn } from "@/lib/gemini";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  structure: FormStructure | null;
  generatedHtml: string;
  onHtmlUpdate: (html: string) => void;
  history: HistoryTurn[];
  onHistoryUpdate: (history: HistoryTurn[]) => void;
}

export default function ChatPanel({
  structure,
  generatedHtml,
  onHtmlUpdate,
  history,
  onHistoryUpdate,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(prompt: string) {
    if (!structure || !prompt.trim() || loading) return;

    setLastPrompt(prompt);
    setInput("");
    setError("");
    setLoading(true);

    const userMessage: Message = { role: "user", text: prompt };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structure,
          prompt,
          history,
          previousHtml: generatedHtml,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      const assistantMessage: Message = {
        role: "assistant",
        text: "Form updated — see preview →",
      };
      setMessages((prev) => [...prev, assistantMessage]);

      onHtmlUpdate(data.html);
      onHistoryUpdate([
        ...history,
        { role: "user", text: prompt },
        { role: "model", text: data.html },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-medium text-gray-500">Style editor</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-gray-400 text-center pt-8">
            {structure
              ? 'Describe how you want the form to look.\nTry "make it dark mode" or "one question at a time".'
              : "Load a form first, then describe your styling."}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : msg.text.startsWith("Error:")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
              <span className="animate-pulse">Generating...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Regenerate button */}
      {lastPrompt && !loading && messages.length > 0 && (
        <div className="px-4 pb-1">
          <button
            onClick={() => send(lastPrompt)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Regenerate last response
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="px-4 pb-1 text-xs text-red-600">{error}</p>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={
              structure
                ? 'Describe your changes... (Enter to send)'
                : 'Load a form first...'
            }
            disabled={!structure || loading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => send(input)}
            disabled={!structure || loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
