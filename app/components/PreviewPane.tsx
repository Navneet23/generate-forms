"use client";

import { useState } from "react";

interface Props {
  originalUrl: string;
  generatedHtml: string;
}

type ViewMode = "desktop" | "mobile";

export default function PreviewPane({ originalUrl, generatedHtml }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");

  const showGenerated = generatedHtml.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500 font-medium mr-1">Preview</span>
        <button
          onClick={() => setViewMode("desktop")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === "desktop"
              ? "bg-white border border-gray-300 text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Desktop
        </button>
        <button
          onClick={() => setViewMode("mobile")}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === "mobile"
              ? "bg-white border border-gray-300 text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Mobile
        </button>
        {showGenerated && (
          <span className="ml-auto text-xs text-green-600 font-medium">
            AI generated
          </span>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4">
        {!originalUrl ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Paste a Google Form URL above to get started
          </div>
        ) : (
          <div
            className="bg-white shadow-md rounded overflow-hidden transition-all duration-300"
            style={{
              width: viewMode === "mobile" ? "390px" : "100%",
              height: "calc(100vh - 180px)",
            }}
          >
            {showGenerated ? (
              <iframe
                key={generatedHtml.slice(0, 40)} // re-mount when HTML changes
                srcDoc={generatedHtml}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="w-full h-full border-0"
                title="Generated form preview"
              />
            ) : (
              <iframe
                src={originalUrl}
                className="w-full h-full border-0"
                title="Original Google Form"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
