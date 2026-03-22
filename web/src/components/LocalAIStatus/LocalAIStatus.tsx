/**
 * Local AI Status Indicator
 *
 * Compact brain icon with status dot for the header area.
 * - Amber dot: loading/classifying
 * - Green dot: ready
 * - Red dot: error
 * - Hidden: idle or disabled
 */

import { Brain } from "lucide-react";
import { useLocalAI } from "src/lib/local-ai";

export function LocalAIStatus() {
  const { status, enabled } = useLocalAI();

  if (!enabled || status === "idle") return null;

  const dotColor =
    status === "ready"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-amber-500";

  const label =
    status === "ready"
      ? "Local AI ready"
      : status === "error"
        ? "Local AI error"
        : status === "loading"
          ? "Loading model..."
          : "Classifying...";

  return (
    <div
      className="relative flex items-center"
      title={label}
      data-testid="local-ai-status"
    >
      <Brain className="h-4 w-4 text-[var(--foreground-muted)]" />
      <span
        className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${dotColor} ${
          status === "loading" || status === "classifying" ? "animate-pulse" : ""
        }`}
      />
    </div>
  );
}
