"use client";

import { useState } from "react";
import { AI_COPY_PROMPT_KEY, DEFAULT_AI_COPY_PROMPT, AI_COPY_TEMPLATE_VARIABLES } from "@/lib/ai-constants";

export function AiPromptEditor({
  currentPrompt,
  className = "",
}: {
  currentPrompt: string | null;
  className?: string;
}) {
  const [prompt, setPrompt] = useState(currentPrompt || DEFAULT_AI_COPY_PROMPT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isDefault = prompt === DEFAULT_AI_COPY_PROMPT;

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/update-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: AI_COPY_PROMPT_KEY, value: prompt }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage("Saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setPrompt(DEFAULT_AI_COPY_PROMPT);
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white px-5 py-4 ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="text-sm font-semibold text-gray-700">
          AI Copy Prompt
        </h3>
        <span className="text-xs text-gray-400">
          {expanded ? "Collapse" : "Edit"}
        </span>
      </button>

      {!expanded && (
        <p className="mt-1 text-xs text-gray-400">
          {isDefault ? "Using default prompt" : "Using custom prompt"}
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            This prompt is sent as the system instruction when generating ad copy.
            Use template variables to reference onboarding form data:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AI_COPY_TEMPLATE_VARIABLES.map((v) => (
              <span
                key={v.key}
                title={v.description}
                className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700"
              >
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Per-placement briefs and type/length are passed separately to each generation.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Prompt"}
            </button>
            {!isDefault && (
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Reset to Default
              </button>
            )}
            {message && (
              <span className="text-sm text-green-600">{message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
