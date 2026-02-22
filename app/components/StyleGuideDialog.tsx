"use client";

import { useEffect, useRef, useState } from "react";
import { StyleGuide } from "@/lib/gemini";

interface Props {
  current: StyleGuide | null;
  onApply: (guide: StyleGuide | null) => void;
  onClose: () => void;
}

type Mode = "image" | "website";

export default function StyleGuideDialog({ current, onApply, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(current ? "image" : "image");
  const [imageBase64, setImageBase64] = useState(current?.imageBase64 ?? "");
  const [imagePreview, setImagePreview] = useState(current?.imageBase64 ?? "");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websitePreview, setWebsitePreview] = useState("");
  const [focusNote, setFocusNote] = useState(current?.focusNote ?? "");
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageBase64(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleWebsitePreview() {
    if (!websiteUrl.trim()) return;
    setScreenshotLoading(true);
    setScreenshotError("");
    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Screenshot failed");
      setWebsitePreview(data.imageBase64);
      setImageBase64(data.imageBase64);
    } catch (e: unknown) {
      setScreenshotError(e instanceof Error ? e.message : "Screenshot failed");
    } finally {
      setScreenshotLoading(false);
    }
  }

  function handleApply() {
    const base64 = mode === "image" ? imageBase64 : websitePreview;
    if (!base64) return;
    onApply({ imageBase64: base64, focusNote: focusNote.trim() });
    onClose();
  }

  function handleClear() {
    onApply(null);
    onClose();
  }

  // Listen for paste events to support Ctrl+V / Cmd+V image from clipboard
  useEffect(() => {
    if (mode !== "image") return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          return;
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const previewSrc = mode === "image" ? imagePreview : websitePreview;
  const canApply = mode === "image" ? !!imageBase64 : !!websitePreview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Provide a style guide</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mode === "image"}
                onChange={() => setMode("image")}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">Upload an image</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mode === "website"}
                onChange={() => setMode("website")}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">Use a website</span>
            </label>
          </div>

          {/* Image upload */}
          {mode === "image" && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Style guide preview" className="max-h-40 mx-auto rounded object-cover" />
              ) : (
                <p className="text-sm text-gray-400">Paste, drop, or click to add an image</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageFile(f);
                }}
              />
            </div>
          )}

          {/* Website URL */}
          {mode === "website" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleWebsitePreview}
                  disabled={screenshotLoading || !websiteUrl.trim()}
                  className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap"
                >
                  {screenshotLoading ? "Loading..." : "Preview"}
                </button>
              </div>
              {screenshotError && (
                <p className="text-xs text-red-600">{screenshotError}</p>
              )}
              {websitePreview && (
                <img src={websitePreview} alt="Website screenshot" className="w-full rounded-lg border border-gray-200 max-h-40 object-cover object-top" />
              )}
            </div>
          )}

          {/* Preview of current style guide (if set and unchanged) */}
          {!previewSrc && current && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs text-gray-500 mb-2">Current style guide</p>
              <img src={current.imageBase64} alt="Current style guide" className="max-h-24 rounded object-cover" />
            </div>
          )}

          {/* Focus note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Anything specific to focus on? <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={focusNote}
              onChange={(e) => setFocusNote(e.target.value)}
              placeholder='e.g. "color palette and typography"'
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {current ? "Clear style guide" : "Cancel"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
