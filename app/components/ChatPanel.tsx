"use client";

import { useEffect, useRef, useState } from "react";
import { FormStructure } from "@/lib/scraper";
import { HistoryTurn, StyleGuide } from "@/lib/gemini";
import StyleGuideDialog from "./StyleGuideDialog";

interface Message {
  role: "user" | "assistant";
  text: string;
  imagePreview?: string; // thumbnail shown in the message bubble
}

interface AttachedImage {
  base64: string;       // full base64 for AI
  previewUrl: string;   // for thumbnail display
  source: "screenshot" | "upload";
  uploadedUrl?: string; // only for "upload" — the hosted URL for AI context
}

interface Props {
  structure: FormStructure | null;
  generatedHtml: string;
  onHtmlUpdate: (html: string) => void;
  history: HistoryTurn[];
  onHistoryUpdate: (history: HistoryTurn[]) => void;
  styleGuide: StyleGuide | null;
  onStyleGuideUpdate: (guide: StyleGuide | null) => void;
  // Screenshot capture: when set, PreviewPane passes the base64 here
  pendingScreenshot: string | null;
  onScreenshotConsumed: () => void;
}

export default function ChatPanel({
  structure,
  generatedHtml,
  onHtmlUpdate,
  history,
  onHistoryUpdate,
  styleGuide,
  onStyleGuideUpdate,
  pendingScreenshot,
  onScreenshotConsumed,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [showStyleGuide, setShowStyleGuide] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-attach screenshot when PreviewPane captures one
  useEffect(() => {
    if (pendingScreenshot) {
      setAttachedImage({
        base64: pendingScreenshot,
        previewUrl: pendingScreenshot,
        source: "screenshot",
      });
      onScreenshotConsumed();
    }
  }, [pendingScreenshot, onScreenshotConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleUploadImage(file: File) {
    setShowPlusMenu(false);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      // Preview thumbnail from local file
      const previewUrl = URL.createObjectURL(file);
      setAttachedImage({
        base64: "",               // not needed — we use the hosted URL
        previewUrl,
        source: "upload",
        uploadedUrl: data.url,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function send(prompt: string) {
    if (!structure || !prompt.trim() || loading) return;

    setLastPrompt(prompt);
    setInput("");
    setError("");
    setLoading(true);

    // Capture and clear attachment before async ops
    const currentAttachment = attachedImage;
    setAttachedImage(null);

    const userMessage: Message = {
      role: "user",
      text: prompt,
      imagePreview: currentAttachment?.previewUrl,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Build extra context for upload images
    let fullPrompt = prompt;
    if (currentAttachment?.source === "upload" && currentAttachment.uploadedUrl) {
      fullPrompt = `The user has uploaded an image to embed in the form. It is hosted at: ${currentAttachment.uploadedUrl}. Use it as directed.\n\n${prompt}`;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structure,
          prompt: fullPrompt,
          history,
          previousHtml: generatedHtml,
          screenshotBase64: currentAttachment?.source === "screenshot" ? currentAttachment.base64 : undefined,
          styleGuide: styleGuide ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Form updated — see preview →" },
      ]);
      onHtmlUpdate(data.html);
      onHistoryUpdate([
        ...history,
        { role: "user", text: fullPrompt },
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
      {/* Style guide dialog */}
      {showStyleGuide && (
        <StyleGuideDialog
          current={styleGuide}
          onApply={onStyleGuideUpdate}
          onClose={() => setShowStyleGuide(false)}
        />
      )}

      {/* Hidden file input for + button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadImage(f);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Style editor</span>
        {styleGuide && (
          <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full inline-block" />
            Style guide active
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-gray-400 text-center pt-8 whitespace-pre-line">
            {structure
              ? 'Describe how you want the form to look.\nTry "make it dark mode" or "one question at a time".'
              : "Load a form first, then describe your styling."}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-1">
              {msg.imagePreview && (
                <img
                  src={msg.imagePreview}
                  alt="Attached"
                  className="rounded-lg max-h-32 object-cover border border-gray-200"
                />
              )}
              <div
                className={`rounded-2xl px-4 py-2 text-sm ${
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

      {/* Regenerate */}
      {lastPrompt && !loading && messages.length > 0 && (
        <div className="px-4 pb-1">
          <button onClick={() => send(lastPrompt)} className="text-xs text-gray-500 hover:text-gray-700 underline">
            Regenerate last response
          </button>
        </div>
      )}
      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

      {/* Attached image thumbnail */}
      {attachedImage && (
        <div className="px-4 pb-1 flex items-center gap-2">
          <div className="relative inline-block">
            <img
              src={attachedImage.previewUrl}
              alt="Attached"
              className="h-14 w-14 rounded-lg object-cover border border-gray-300"
            />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center leading-none"
            >
              ×
            </button>
          </div>
          <span className="text-xs text-gray-500">
            {attachedImage.source === "screenshot" ? "Screenshot attached" : "Image to embed"}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2">
        {/* Toolbar row */}
        <div className="flex items-center gap-2">
          {/* + button */}
          <div className="relative">
            <button
              onClick={() => setShowPlusMenu((v) => !v)}
              disabled={!structure || uploading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-40 text-lg leading-none"
              title="Upload image to embed in form"
            >
              {uploading ? "…" : "+"}
            </button>
            {showPlusMenu && (
              <div className="absolute bottom-10 left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 whitespace-nowrap">
                <button
                  onClick={() => { setShowPlusMenu(false); fileInputRef.current?.click(); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  📎 Upload image
                </button>
              </div>
            )}
          </div>

          {/* Style guide button */}
          <button
            onClick={() => setShowStyleGuide(true)}
            disabled={!structure}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
              styleGuide
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {styleGuide ? "Style guide ✓" : "Style guide"}
          </button>
        </div>

        {/* Text input + send */}
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
            placeholder={structure ? "Describe your changes... (Enter to send)" : "Load a form first..."}
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
