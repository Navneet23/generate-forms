"use client";

import { useState } from "react";

export interface TimelineStep {
  step: string;
  label: string;
  status: "started" | "completed" | "failed" | "pending" | "skipped";
  detail?: string;
  startedAt: number;
  completedAt?: number;
  imageIndex?: number;
  imageCount?: number;
  imageType?: string;
}

interface TimelineMessageProps {
  steps: TimelineStep[];
  totalDuration: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isLive: boolean;
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-amber-500"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="28"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-green-500"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg
      className="h-4 w-4 text-red-500"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-300"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function SkippedIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 8h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusIcon({ status }: { status: TimelineStep["status"] }) {
  switch (status) {
    case "started":
      return <SpinnerIcon />;
    case "completed":
      return <CheckIcon />;
    case "failed":
      return <FailIcon />;
    case "pending":
      return <PendingIcon />;
    case "skipped":
      return <SkippedIcon />;
  }
}

function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function getStepLabel(step: TimelineStep): { label: string; expandableDetail?: string } {
  // TASK-8: Multi-image step numbering + image type label
  if (step.step === "image_gen" || step.step === "color_match") {
    const hasMultiple = step.imageCount !== undefined && step.imageCount > 1;
    const index = step.imageIndex ?? 1;
    const typeLabel = step.imageType ? ` (${step.imageType})` : "";

    if (step.step === "image_gen") {
      const prefix = hasMultiple
        ? `Generating image ${index}${typeLabel}`
        : `Generating image${typeLabel}`;
      // Show prompt as truncated inline, expandable on click
      if (step.detail) {
        return { label: prefix, expandableDetail: step.detail };
      }
      return { label: prefix };
    }

    if (step.step === "color_match") {
      const prefix = hasMultiple
        ? `Image ${index} ready, matching colors`
        : "Image ready, matching colors";
      return { label: prefix };
    }
  }

  return { label: step.label };
}

function StepRow({ step }: { step: TimelineStep }) {
  const [expanded, setExpanded] = useState(false);

  const { label, expandableDetail } = getStepLabel(step);
  const elapsed =
    step.status === "completed" && step.completedAt
      ? formatDuration(step.completedAt - step.startedAt)
      : null;

  const isSkippedOrPending = step.status === "skipped" || step.status === "pending";

  // For image steps, prompt is returned as expandableDetail
  // For other steps, show detail from the step object
  const detailText = expandableDetail || (
    step.detail && step.step !== "image_gen" && step.step !== "color_match"
      ? step.detail
      : null
  );

  // Build inline preview for image prompts (truncated in label line)
  const inlinePromptPreview = expandableDetail && !expanded
    ? expandableDetail
    : null;

  return (
    <div
      className={`flex items-start gap-2 min-w-0 ${detailText ? "cursor-pointer" : ""}`}
      onClick={detailText ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="flex-shrink-0 mt-0.5">
        <StatusIcon status={step.status} />
      </div>
      <div className={`flex-1 min-w-0 ${isSkippedOrPending ? "opacity-50" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-gray-700 truncate">
            {label}{inlinePromptPreview ? `: ${inlinePromptPreview}` : ""}
          </span>
          {elapsed && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {elapsed}
            </span>
          )}
          {step.status === "skipped" && (
            <span className="text-xs text-gray-400 flex-shrink-0 italic">
              skipped
            </span>
          )}
        </div>
        {expanded && detailText && (
          <p className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">
            {detailText}
          </p>
        )}
      </div>
    </div>
  );
}

export default function TimelineMessage({
  steps,
  totalDuration,
  collapsed,
  onToggleCollapse,
  isLive,
}: TimelineMessageProps) {
  if (collapsed) {
    return (
      <div className="bg-gray-100 rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-700">
            Form generated in {steps.length} step{steps.length !== 1 ? "s" : ""}{" "}
            ({formatDuration(totalDuration)})
          </span>
          <button
            onClick={onToggleCollapse}
            className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
          >
            Expand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-2xl px-4 py-3 space-y-2">
      {steps.map((step, i) => (
        <StepRow key={`${step.step}-${step.imageIndex ?? 0}-${i}`} step={step} />
      ))}
      {!isLive && (
        <div className="flex justify-end">
          <button
            onClick={onToggleCollapse}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Collapse
          </button>
        </div>
      )}
    </div>
  );
}
