"use client";

import { useState } from "react";

export interface TimelineStep {
  step: string;
  label: string;
  status: "started" | "completed" | "failed";
  detail?: string;
  startedAt: number;
  completedAt?: number;
  imageIndex?: number;
  imageCount?: number;
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

function StatusIcon({ status }: { status: TimelineStep["status"] }) {
  switch (status) {
    case "started":
      return <SpinnerIcon />;
    case "completed":
      return <CheckIcon />;
    case "failed":
      return <FailIcon />;
  }
}

function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function getStepLabel(step: TimelineStep): string {
  // TASK-8: Multi-image step numbering
  if (step.step === "image_gen" || step.step === "color_match") {
    const hasMultiple = step.imageCount !== undefined && step.imageCount > 1;
    const index = step.imageIndex ?? 1;

    if (step.step === "image_gen") {
      const prefix = hasMultiple
        ? `Generating image ${index}`
        : "Generating image";
      return step.detail ? `${prefix}: ${step.detail}` : prefix;
    }

    if (step.step === "color_match") {
      const prefix = hasMultiple
        ? `Image ${index} ready, matching colors`
        : "Image ready, matching colors";
      return prefix;
    }
  }

  return step.label;
}

function StepRow({ step }: { step: TimelineStep }) {
  const [expanded, setExpanded] = useState(false);

  const label = getStepLabel(step);
  const elapsed =
    step.status === "completed" && step.completedAt
      ? formatDuration(step.completedAt - step.startedAt)
      : null;

  // For image steps, detail is already folded into the label.
  // For other steps, show detail separately below.
  const showDetail =
    step.detail &&
    step.step !== "image_gen" &&
    step.step !== "color_match";

  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="flex-shrink-0 mt-0.5">
        <StatusIcon status={step.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-gray-700 truncate">{label}</span>
          {elapsed && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {elapsed}
            </span>
          )}
        </div>
        {showDetail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-left w-full"
          >
            <p
              className={`text-xs text-gray-500 ${
                expanded ? "whitespace-pre-wrap" : "truncate"
              }`}
            >
              {step.detail}
            </p>
          </button>
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
