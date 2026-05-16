"use client";

import { useState } from "react";
import { Copy, Check, ChevronRight, Loader2, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";

type Phase = "input" | "clarify" | "result";

interface BuildState {
  rawInput: string;
  taskType: string;
  questions: string[];
  answers: Record<string, string>;
  projectFilter: string;
  prompt: string;
  sourcesUsed: string[];
  resolvedProject: string;
  followUps: string[];
}

const TASK_TYPE_COLOURS: Record<string, string> = {
  feature: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  bugfix: "bg-red-500/20 text-red-300 border-red-500/30",
  architecture: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  docs: "bg-green-500/20 text-green-300 border-green-500/30",
  research: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  unknown: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

const EMPTY_STATE: BuildState = {
  rawInput: "",
  taskType: "",
  questions: [],
  answers: {},
  projectFilter: "",
  prompt: "",
  sourcesUsed: [],
  resolvedProject: "",
  followUps: [],
};

export default function PromptBuilderClient() {
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<BuildState>(EMPTY_STATE);

  async function callBuild(rawInput: string, taskType: string, answers: Record<string, string>) {
    setLoadingLabel("Retrieving context and writing prompt...");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput,
          clarifications: answers,
          projectFilter: state.projectFilter || undefined,
          phase: "build",
        }),
      });
      const data = await res.json() as {
        status: string;
        taskType?: string;
        prompt?: string;
        sourcesUsed?: string[];
        resolvedProject?: string;
        followUps?: string[];
        message?: string;
      };

      if (data.status === "prompt_ready" && data.prompt) {
        setState((s) => ({
          ...s,
          taskType: taskType,
          prompt: data.prompt!,
          sourcesUsed: data.sourcesUsed ?? [],
          resolvedProject: data.resolvedProject ?? "",
          followUps: data.followUps ?? [],
        }));
        setPhase("result");
      } else {
        setError(data.message ?? "Failed to build prompt");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleDetect() {
    if (!state.rawInput.trim()) return;
    setLoadingLabel("Analysing your request...");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: state.rawInput, phase: "detect" }),
      });
      const data = await res.json() as { taskType: string; questions: string[] };

      setState((s) => ({ ...s, taskType: data.taskType, questions: data.questions }));

      if (data.questions.length === 0) {
        // Gemini decided no clarification needed — build immediately
        setLoading(false);
        await callBuild(state.rawInput, data.taskType, {});
      } else {
        setLoading(false);
        setLoadingLabel("");
        setPhase("clarify");
      }
    } catch (e) {
      setLoading(false);
      setLoadingLabel("");
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function handleBuild() {
    await callBuild(state.rawInput, state.taskType, state.answers);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(state.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setPhase("input");
    setState(EMPTY_STATE);
    setError("");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h1 className="text-lg font-semibold">Prompt Builder</h1>
            </div>
            <p className="text-gray-500 text-sm">
              Describe what you want to do. ESAI retrieves your real project context and writes a specific Claude prompt.
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8 text-xs text-gray-600">
            {(["Describe", "Clarify", "Prompt Ready"] as const).map((label, i) => {
              const phaseIndex = ["input", "clarify", "result"].indexOf(phase);
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className={`font-medium transition-colors ${
                    i < phaseIndex ? "text-gray-500" : i === phaseIndex ? "text-white" : "text-gray-700"
                  }`}>
                    {label}
                  </span>
                  {i < 2 && <ChevronRight className="w-3 h-3 text-gray-700" />}
                </div>
              );
            })}
          </div>

          {/* Phase 1 — Input */}
          {phase === "input" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">What do you want to do?</label>
                <textarea
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-600 transition-colors"
                  rows={4}
                  placeholder="e.g. I want to add retry logic to the embedding pipeline when Gemini returns a 429..."
                  value={state.rawInput}
                  onChange={(e) => setState((s) => ({ ...s, rawInput: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleDetect(); }}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Project filter <span className="text-gray-600">(optional — helps retrieve the right context)</span>
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
                  placeholder="e.g. ESAI, PowerProx..."
                  value={state.projectFilter}
                  onChange={(e) => setState((s) => ({ ...s, projectFilter: e.target.value }))}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>
              )}

              <button
                onClick={handleDetect}
                disabled={loading || !state.rawInput.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{loadingLabel || "Thinking..."}</>
                ) : (
                  <>Continue <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
              <p className="text-gray-700 text-xs text-center">⌘ + Enter to continue</p>
            </div>
          )}

          {/* Phase 2 — Clarify */}
          {phase === "clarify" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded border font-medium ${TASK_TYPE_COLOURS[state.taskType] ?? TASK_TYPE_COLOURS.unknown}`}>
                  {state.taskType.toUpperCase()}
                </span>
                <span className="text-gray-500 text-sm">
                  {state.questions.length === 1 ? "One quick question:" : `${state.questions.length} questions to sharpen the prompt:`}
                </span>
              </div>

              {state.questions.map((question, i) => (
                <div key={i}>
                  <label className="block text-sm text-gray-300 mb-2">
                    {state.questions.length > 1 ? `${i + 1}. ` : ""}{question}
                  </label>
                  <textarea
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-600 transition-colors"
                    rows={3}
                    placeholder="Your answer..."
                    value={state.answers[question] ?? ""}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        answers: { ...s.answers, [question]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-3 bg-gray-900 border border-gray-800 text-gray-400 rounded-xl text-sm hover:border-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleBuild}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{loadingLabel || "Building prompt..."}</>
                  ) : (
                    <>Build Prompt <Zap className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Phase 3 — Result */}
          {phase === "result" && (
            <div className="space-y-5">

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded border font-medium ${TASK_TYPE_COLOURS[state.taskType] ?? TASK_TYPE_COLOURS.unknown}`}>
                  {state.taskType.toUpperCase()}
                </span>
                {state.resolvedProject && state.resolvedProject !== "all namespaces" && (
                  <span className="text-xs px-2 py-1 bg-gray-900 border border-gray-800 rounded text-gray-400">
                    namespace: {state.resolvedProject}
                  </span>
                )}
              </div>

              {/* Sources */}
              {state.sourcesUsed.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-600 shrink-0">Context from:</span>
                  {state.sourcesUsed.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 bg-gray-900 border border-gray-800 rounded text-gray-500">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Prompt output */}
              <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-300 overflow-auto max-h-[55vh] whitespace-pre-wrap font-mono leading-relaxed">
                {state.prompt}
              </pre>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-3 bg-gray-900 border border-gray-800 text-gray-400 rounded-xl text-sm hover:border-gray-700 transition-colors"
                >
                  Build Another
                </button>
                <button
                  onClick={handleCopy}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <><Check className="w-4 h-4" /> Copied</>
                  ) : (
                    <><Copy className="w-4 h-4" /> Copy Prompt</>
                  )}
                </button>
              </div>

              {/* Follow-up suggestions */}
              {state.followUps.length > 0 && (
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs text-gray-600 mb-2">Likely follow-up prompts after Claude responds:</p>
                  <ol className="space-y-1">
                    {state.followUps.map((f, i) => (
                      <li key={i} className="text-xs text-gray-500 flex gap-2">
                        <span className="text-gray-700 shrink-0">{i + 1}.</span>
                        <span>&quot;{f}&quot;</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
