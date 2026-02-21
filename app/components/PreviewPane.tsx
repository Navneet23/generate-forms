"use client";

import { useRef, useState } from "react";

interface Props {
  originalUrl: string;
  generatedHtml: string;
  onScreenshotCapture: (base64: string) => void;
}

type ViewMode = "desktop" | "mobile";

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function PreviewPane({ originalUrl, generatedHtml, onScreenshotCapture }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const showGenerated = generatedHtml.length > 0;

  function getOverlayCoords(e: React.MouseEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!showGenerated) return;
    const { x, y } = getOverlayCoords(e);
    setSelecting(true);
    setSelection({ startX: x, startY: y, endX: x, endY: y });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!selecting || !selection) return;
    const { x, y } = getOverlayCoords(e);
    setSelection((s) => s ? { ...s, endX: x, endY: y } : null);
  }

  async function onMouseUp() {
    if (!selecting || !selection) return;
    setSelecting(false);

    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    // Ignore tiny accidental selections
    if (width < 10 || height < 10) {
      setSelection(null);
      return;
    }

    setCapturing(true);
    try {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument) throw new Error("Cannot access iframe");

      const doc = iframe.contentDocument;

      // Inject html2canvas if not already present
      if (!(iframe.contentWindow as Window & { html2canvas?: unknown }).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = doc.createElement("script");
          // Use a CDN-hosted build injected at runtime (not from generated form HTML)
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load html2canvas"));
          doc.head.appendChild(script);
        });
      }

      // Run html2canvas inside the iframe's context
      const canvas = await (iframe.contentWindow as Window & { html2canvas: (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement> }).html2canvas(
        doc.body,
        {
          x,
          y,
          width,
          height,
          useCORS: true,
          allowTaint: true,
          scale: 1,
        }
      );

      const base64 = canvas.toDataURL("image/png");
      onScreenshotCapture(base64);
    } catch (err) {
      console.error("Screenshot capture failed:", err);
    } finally {
      setCapturing(false);
      setSelection(null);
    }
  }

  // Compute selection rect for display
  const selRect = selection
    ? {
        left: Math.min(selection.startX, selection.endX),
        top: Math.min(selection.startY, selection.endY),
        width: Math.abs(selection.endX - selection.startX),
        height: Math.abs(selection.endY - selection.startY),
      }
    : null;

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
            {capturing ? "Capturing..." : "AI generated · drag to select region"}
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
            className="bg-white shadow-md rounded overflow-hidden transition-all duration-300 relative"
            style={{
              width: viewMode === "mobile" ? "390px" : "100%",
              height: "calc(100vh - 180px)",
            }}
          >
            {showGenerated ? (
              <>
                <iframe
                  ref={iframeRef}
                  key={generatedHtml.slice(0, 40)}
                  srcDoc={generatedHtml}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  className="w-full h-full border-0"
                  title="Generated form preview"
                />
                {/* Screenshot selection overlay */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0"
                  style={{ cursor: selecting ? "crosshair" : "crosshair", zIndex: 10 }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                >
                  {/* Selection rectangle */}
                  {selRect && selRect.width > 0 && (
                    <div
                      className="absolute border-2 border-blue-500 bg-blue-100/20 pointer-events-none"
                      style={{
                        left: selRect.left,
                        top: selRect.top,
                        width: selRect.width,
                        height: selRect.height,
                      }}
                    />
                  )}
                </div>
              </>
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
