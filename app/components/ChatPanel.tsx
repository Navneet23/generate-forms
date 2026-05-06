"use client";

import { useEffect, useRef, useState } from "react";
import { FormStructure } from "@/lib/scraper";
import { HistoryTurn, StyleGuide, GeneratedImage } from "@/lib/gemini";
import StyleGuideDialog from "./StyleGuideDialog";
import TimelineMessage, { TimelineStep } from "./TimelineMessage";

type Message =
  | { role: "user"; text: string; imagePreview?: string }
  | { role: "assistant"; text: string }
  | { role: "assistant"; type: "timeline"; steps: TimelineStep[]; totalDuration: number; collapsed: boolean };

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
  // Screenshot mode toggle
  screenshotMode: boolean;
  onToggleScreenshotMode: () => void;
  // Image generation
  imageModel: "none" | "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview";
  onImageModelChange: (model: "none" | "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview") => void;
  activeImages: GeneratedImage[];
  onActiveImagesUpdate: (images: GeneratedImage[]) => void;
}

const stepLabelMap: Record<string, string> = {
  analyze: "Analyzing request...",
  plan: "Planning approach...",
  image_gen: "Generate images",
  color_match: "Match colors",
  html_gen: "Generating form HTML...",
};

function createTemplateSteps(includeImages: boolean): TimelineStep[] {
  const now = Date.now();
  const steps: TimelineStep[] = [
    { step: "analyze", label: "Analyzing request...", status: "pending", startedAt: now },
    { step: "plan", label: "Planning approach...", status: "pending", startedAt: now },
  ];
  if (includeImages) {
    steps.push(
      { step: "image_gen", label: "Generate images", status: "pending", startedAt: now },
      { step: "color_match", label: "Match colors", status: "pending", startedAt: now },
    );
  }
  steps.push({ step: "html_gen", label: "Generating form HTML...", status: "pending", startedAt: now });
  return steps;
}

function findMatchingStep(steps: TimelineStep[], stepName: string, imageIndex?: number): number {
  // For image steps with an index, find exact match
  if (imageIndex !== undefined) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].step === stepName && steps[i].imageIndex === imageIndex) {
        return i;
      }
    }
  }
  // For non-indexed steps, find by name with started or pending status
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].step === stepName && (steps[i].status === 'started' || steps[i].status === 'pending')) {
      if (steps[i].imageIndex === undefined) return i;
    }
  }
  return -1;
}

function processStepEvent(event: Record<string, unknown>, steps: TimelineStep[]) {
  const stepName = event.step as string;
  const status = event.status as "started" | "completed" | "failed";
  const imageIndex = event.imageIndex as number | undefined;
  const imageCount = event.imageCount as number | undefined;
  const imageType = event.imageType as string | undefined;

  if (stepName === "image_gen" && status === "started" && imageIndex !== undefined) {
    // Insert individual image step before the placeholder or color_match
    // Find the placeholder image_gen step
    const placeholderIdx = steps.findIndex(s => s.step === "image_gen" && s.imageIndex === undefined);
    const colorMatchIdx = steps.findIndex(s => s.step === "color_match" && s.imageIndex === undefined);
    const insertIdx = colorMatchIdx >= 0 ? colorMatchIdx : (placeholderIdx >= 0 ? placeholderIdx + 1 : steps.length);

    // Remove the generic placeholder if this is the first image
    if (placeholderIdx >= 0) {
      steps.splice(placeholderIdx, 1);
      // Adjust insertIdx if placeholder was before it
      const adjustedInsertIdx = placeholderIdx < insertIdx ? insertIdx - 1 : insertIdx;

      steps.splice(adjustedInsertIdx, 0, {
        step: "image_gen",
        label: stepLabelMap["image_gen"],
        status: "started",
        detail: event.detail as string | undefined,
        startedAt: Date.now(),
        imageIndex,
        imageCount,
        imageType,
      });
    } else {
      // Subsequent images — insert before color_match
      const cmIdx = steps.findIndex(s => s.step === "color_match");
      const insIdx = cmIdx >= 0 ? cmIdx : steps.length;
      steps.splice(insIdx, 0, {
        step: "image_gen",
        label: stepLabelMap["image_gen"],
        status: "started",
        detail: event.detail as string | undefined,
        startedAt: Date.now(),
        imageIndex,
        imageCount,
        imageType,
      });
    }
    return;
  }

  if (status === 'started') {
    // Transition pending template step to started
    const idx = findMatchingStep(steps, stepName, imageIndex);
    if (idx >= 0 && steps[idx].status === 'pending') {
      steps[idx] = { ...steps[idx], status: 'started', startedAt: Date.now(), detail: event.detail as string | undefined };
    } else if (idx < 0) {
      // Unknown step — append
      steps.push({
        step: stepName,
        label: stepLabelMap[stepName] || stepName,
        status: 'started',
        detail: event.detail as string | undefined,
        startedAt: Date.now(),
        imageIndex,
        imageCount,
        imageType,
      });
    }
  } else if (status === 'completed' || status === 'failed') {
    const idx = findMatchingStep(steps, stepName, imageIndex);
    if (idx >= 0) {
      steps[idx] = {
        ...steps[idx],
        status,
        completedAt: Date.now(),
        detail: (event.detail as string) || steps[idx].detail,
        imageType: imageType || steps[idx].imageType,
      };
    }
  }
}

function markImagesSkipped(steps: TimelineStep[]) {
  for (let i = 0; i < steps.length; i++) {
    if ((steps[i].step === "image_gen" || steps[i].step === "color_match") && steps[i].status === "pending") {
      steps[i] = { ...steps[i], status: "skipped" };
    }
  }
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
  screenshotMode,
  onToggleScreenshotMode,
  imageModel,
  onImageModelChange,
  activeImages,
  onActiveImagesUpdate,
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
  const abortControllerRef = useRef<AbortController | null>(null);

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

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

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
          imageModel,
          activeImages: imageModel !== "none" ? activeImages : undefined,
        }),
        signal: abortControllerRef.current!.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error ?? "Generation failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const genStartTime = Date.now();
      const includeImages = imageModel !== "none";
      const currentSteps: TimelineStep[] = createTemplateSteps(includeImages);
      let receivedResult = false;
      let hadImageEvents = false;

      // Show template immediately
      setMessages(prev => [...prev, {
        role: "assistant" as const,
        type: "timeline" as const,
        steps: [...currentSteps],
        totalDuration: 0,
        collapsed: false,
      }]);

      const updateTimeline = () => {
        const totalDuration = Date.now() - genStartTime;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          const timelineMsg: Message = {
            role: "assistant" as const,
            type: "timeline" as const,
            steps: [...currentSteps],
            totalDuration,
            collapsed: false,
          };
          if (last && 'type' in last && last.type === 'timeline') {
            return [...prev.slice(0, -1), timelineMsg];
          }
          return [...prev, timelineMsg];
        });
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            const event = JSON.parse(part.slice(6));

            if (event.type === 'step') {
              if (event.step === 'image_gen') hadImageEvents = true;
              // If html_gen starts and no images were generated, mark image steps as skipped
              if (event.step === 'html_gen' && !hadImageEvents && includeImages) {
                markImagesSkipped(currentSteps);
              }
              processStepEvent(event, currentSteps);
              updateTimeline();
            } else if (event.type === 'result') {
              receivedResult = true;
              const totalDuration = Date.now() - genStartTime;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                const finalTimeline: Message = {
                  role: "assistant" as const,
                  type: "timeline" as const,
                  steps: [...currentSteps],
                  totalDuration,
                  collapsed: false,
                };
                const updated = (last && 'type' in last && last.type === 'timeline')
                  ? [...prev.slice(0, -1), finalTimeline]
                  : [...prev, finalTimeline];

                const imageCount = event.generatedImages?.length ?? 0;
                const imageErrorMsgs: string[] = (event.imageErrors ?? []).map(
                  (e: { code: number | null; message: string }) =>
                    `Image generation failed${e.code ? ` (${e.code})` : ""}: ${e.message}`
                );
                let statusText = imageCount > 0
                  ? `Form updated with ${imageCount} generated image${imageCount > 1 ? "s" : ""} — see preview →`
                  : "Form updated — see preview →";
                if (imageErrorMsgs.length > 0) {
                  statusText += "\n" + imageErrorMsgs.join("\n");
                }
                return [...updated, { role: "assistant" as const, text: statusText }];
              });

              onHtmlUpdate(event.html);
              onHistoryUpdate([
                ...history,
                { role: "user", text: fullPrompt },
                { role: "model", text: event.html },
              ]);

              if (event.generatedImages?.length > 0) {
                onActiveImagesUpdate([...activeImages, ...event.generatedImages]);
              }
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          }
        }
      } catch (readError) {
        // Re-throw errors from our own code (error events, JSON parse, etc.)
        if (readError instanceof Error && !(readError instanceof TypeError)) {
          throw readError;
        }
        // Network/TypeError during streaming (e.g., failed to fetch body)
        currentSteps.push({
          step: 'connection',
          label: 'Connection error',
          status: 'failed',
          detail: readError instanceof Error ? readError.message : 'Network error',
          startedAt: Date.now(),
          completedAt: Date.now(),
        });
        updateTimeline();
        setError("Connection error during generation");
        return;
      }

      // Connection drop: stream ended without result event
      if (!receivedResult) {
        currentSteps.push({
          step: 'connection',
          label: 'Connection lost',
          status: 'failed',
          detail: 'The connection was interrupted before generation completed. Click "Regenerate last response" to retry.',
          startedAt: Date.now(),
          completedAt: Date.now(),
        });
        updateTimeline();
        setError("Connection lost during generation");
      }
    } catch (e: unknown) {
      // Don't show error if request was intentionally aborted
      if (e instanceof DOMException && e.name === 'AbortError') return;
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
          <div key={i} className={`flex ${'text' in msg && msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {'type' in msg && msg.type === 'timeline' ? (
              <div className="max-w-[85%]">
                <TimelineMessage
                  steps={msg.steps}
                  totalDuration={msg.totalDuration}
                  collapsed={msg.collapsed}
                  onToggleCollapse={() => {
                    setMessages(prev => prev.map((m, j) =>
                      j === i && 'type' in m && m.type === 'timeline'
                        ? { ...m, collapsed: !m.collapsed }
                        : m
                    ));
                  }}
                  isLive={loading && i === messages.length - 1}
                />
              </div>
            ) : (
              <div className="max-w-[85%] space-y-1">
                {'imagePreview' in msg && msg.imagePreview && (
                  <img
                    src={msg.imagePreview}
                    alt="Attached"
                    className="rounded-lg max-h-32 object-cover border border-gray-200"
                  />
                )}
                <div
                  className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : ('text' in msg && msg.text.startsWith("Error:"))
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : ('text' in msg && msg.text.includes("Image generation failed"))
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {'text' in msg ? msg.text : ''}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && !(messages.length > 0 && 'type' in messages[messages.length - 1] && (messages[messages.length - 1] as { type?: string }).type === 'timeline') && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
              <span className="animate-pulse">
                {imageModel !== "none" ? "Generating (may include images)..." : "Generating..."}
              </span>
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

          {/* Screenshot button — only shown when AI form exists */}
          {!!generatedHtml && (
            <button
              onClick={onToggleScreenshotMode}
              title={screenshotMode ? "Cancel screenshot (Esc)" : "Select a region to attach to your message"}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                screenshotMode
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-gray-300 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {/* Crop / selection icon */}
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 1v2H1v1h2v7H1v1h2v2h1v-2h7v2h1v-2h2v-1h-2V4h2V3h-2V1h-1v2H4V1H3zm1 3h7v7H4V4z" fill="currentColor"/>
              </svg>
            </button>
          )}

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

          {/* Image model selector */}
          <select
            value={imageModel}
            onChange={(e) => onImageModelChange(e.target.value as "none" | "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview")}
            disabled={!structure}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
              imageModel !== "none"
                ? "bg-purple-50 border-purple-300 text-purple-700"
                : "border-gray-300 text-gray-600"
            }`}
          >
            <option value="none">No images</option>
            <option value="gemini-2.5-flash-image">Gemini 2.5 Flash image</option>
            <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash image</option>
          </select>
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
