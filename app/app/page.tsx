"use client";

import { useState } from "react";
import UrlBar from "@/components/UrlBar";
import PreviewPane from "@/components/PreviewPane";
import ChatPanel from "@/components/ChatPanel";
import { FormStructure } from "@/lib/scraper";
import { HistoryTurn } from "@/lib/gemini";

export default function Home() {
  const [formUrl, setFormUrl] = useState("");
  const [structure, setStructure] = useState<FormStructure | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleFormLoad(url: string, s: FormStructure) {
    setFormUrl(url);
    setStructure(s);
    setGeneratedHtml("");
    setHistory([]);
    setPublishedUrl("");
  }

  async function handlePublish() {
    if (!generatedHtml || !structure) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: generatedHtml, formId: structure.formId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setPublishedUrl(data.url);
    } catch (e) {
      console.error(e);
    } finally {
      setPublishing(false);
    }
  }

  function handleCopy() {
    const fullUrl = `${window.location.origin}${publishedUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* URL Bar */}
      <UrlBar onLoad={handleFormLoad} disabled={false} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preview pane */}
        <div className="flex-1 border-r border-gray-200 overflow-hidden">
          <PreviewPane originalUrl={formUrl} generatedHtml={generatedHtml} />
        </div>

        {/* Chat panel */}
        <div className="w-80 xl:w-96 flex-shrink-0 overflow-hidden">
          <ChatPanel
            structure={structure}
            generatedHtml={generatedHtml}
            onHtmlUpdate={setGeneratedHtml}
            history={history}
            onHistoryUpdate={setHistory}
          />
        </div>
      </div>

      {/* Publish bar */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 flex items-center gap-3">
        <button
          onClick={handlePublish}
          disabled={!generatedHtml || publishing}
          className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {publishing ? "Publishing..." : "Publish"}
        </button>

        {publishedUrl ? (
          <>
            <span className="text-sm text-gray-600 truncate">
              localhost:3000{publishedUrl}
            </span>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-white text-gray-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Open ↗
            </a>
          </>
        ) : (
          <span className="text-xs text-gray-400">
            Generate a styled form first, then publish to get a shareable URL.
          </span>
        )}
      </div>
    </div>
  );
}
