/**
 * Local AI Toggle
 *
 * Settings toggle for enabling in-browser AI classification.
 * Follows the WebGPUEffectsToggle pattern. Hidden when WebGPU unavailable.
 * Shows download progress bar during first model load.
 */

import { Brain } from "lucide-react";
import { useLocalAI } from "src/lib/local-ai";
import { LOCAL_AI_RUNTIME } from "src/lib/local-ai/config";

export function LocalAIToggle() {
  const { status, enabled, setEnabled, downloadProgress, downloadStatus } = useLocalAI();

  const isLoading = status === "loading";
  const isReady = status === "ready";
  const isError = status === "error";

  return (
    <div className="space-y-3" data-testid="local-ai-toggle">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
        Local AI
      </h3>

      <button
        onClick={() => setEnabled(!enabled)}
        className={`flex min-w-0 items-center gap-3 w-full p-3 rounded-xl border transition-all ${
          enabled
            ? "border-[var(--accent-primary)] bg-[var(--accent-light)]"
            : "surface-chip border-[var(--border)] hover:border-[var(--border-hover)]"
        }`}
        data-testid="local-ai-button"
      >
        <Brain
          className={`h-5 w-5 ${enabled ? "text-[var(--accent-primary)]" : "text-[var(--foreground-muted)]"}`}
        />
        <div className="min-w-0 flex-1 text-left">
          <span className="text-sm font-medium text-[var(--foreground)]">
            Browser AI Classification
          </span>
          <p className="text-xs text-[var(--foreground-muted)]">
            {!enabled &&
              `Classify saves with ${LOCAL_AI_RUNTIME.modelLabel} running locally in your browser. ${LOCAL_AI_RUNTIME.downloadLabel} on first use — nothing is sent to a server or stored on your device.`}
            {enabled && isLoading && downloadStatus}
            {enabled && isReady && "Ready — classifies content instantly"}
            {enabled && isError && (
              <span className="text-red-400">
                {downloadStatus || "Error loading model"} — tap to retry
              </span>
            )}
            {enabled && status === "idle" && "Initializing..."}
            {enabled && status === "classifying" && "Classifying..."}
          </p>
        </div>
        <div
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-[var(--accent-primary)]" : "bg-[var(--border)]"
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </div>
      </button>

      {/* Download progress bar */}
      {enabled && isLoading && downloadProgress > 0 && downloadProgress < 100 && (
        <div className="px-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--foreground-muted)] text-right">
            {downloadProgress}%
          </p>
        </div>
      )}
    </div>
  );
}
