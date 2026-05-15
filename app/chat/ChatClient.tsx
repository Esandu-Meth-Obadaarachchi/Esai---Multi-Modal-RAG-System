"use client";

import { useState, useRef, useEffect } from "react";
import Navbar from "@/components/Navbar";
import SourcePanel from "@/components/SourcePanel";
import type { ChatMessage, RetrievedChunk } from "@/types";

export default function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<RetrievedChunk[]>([]);
  const [input, setInput] = useState("");
  const [project, setProject] = useState("all");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, project }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error ?? "Something went wrong"}` },
        ]);
      } else {
        setSources(data.sources ?? []);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            agentSteps: data.agentSteps,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — is the server running?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Source panel — left sidebar */}
        <SourcePanel sources={sources} />

        {/* Main chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Project filter bar */}
          <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-3 bg-gray-950">
            <span className="text-xs text-gray-500 shrink-0">Filter by project:</span>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="all"
              className="w-48 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <span className="text-xs text-gray-600">
              Type a project name or leave as &quot;all&quot; to search everything
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Ask anything from your knowledge base.</p>
                <p className="text-gray-600 text-xs">e.g. &quot;What was my approach to auth in PowerProx?&quot;</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold mr-3 mt-1 shrink-0">
                    E
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content}

                  {/* Agent steps toggle */}
                  {msg.agentSteps && msg.agentSteps.length > 0 && (
                    <details className="mt-2 border-t border-gray-700 pt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                        Show reasoning steps ({msg.agentSteps.length})
                      </summary>
                      <ol className="mt-2 space-y-1">
                        {msg.agentSteps.map((step, j) => (
                          <li key={j} className="text-xs text-gray-500">
                            <span className="text-gray-600 mr-1">{j + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold mr-3 shrink-0">
                  E
                </div>
                <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-gray-800 px-6 py-4 bg-gray-950">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything from your knowledge base..."
                rows={1}
                className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition text-sm resize-none"
                style={{ maxHeight: "160px", overflowY: "auto" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">Enter to send · Shift+Enter for new line</p>
          </div>

        </div>
      </div>
    </div>
  );
}
