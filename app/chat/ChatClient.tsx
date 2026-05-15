"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Navbar from "@/components/Navbar";
import SourcePanel from "@/components/SourcePanel";
import type { ChatMessage, RetrievedChunk } from "@/types";

interface ConversationSummary {
  _id: string;
  title: string;
  project: string;
  updatedAt: string;
}

export default function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<RetrievedChunk[]>([]);
  const [input, setInput] = useState("");
  const [project, setProject] = useState("auto");
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load projects and conversation history on mount
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});

    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (data.conversation) {
        setMessages(
          data.conversation.messages.map((m: { role: "user" | "assistant"; content: string; sources?: RetrievedChunk[] }) => ({
            role: m.role,
            content: m.content,
            sources: m.sources,
          }))
        );
        setSources(data.conversation.messages.findLast((m: { role: string }) => m.role === "assistant")?.sources ?? []);
        setActiveConvId(id);
      }
    } catch {
      // ignore
    }
  }, []);

  const startNewChat = () => {
    setMessages([]);
    setSources([]);
    setActiveConvId(null);
    setInput("");
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c._id !== id));
    if (activeConvId === id) startNewChat();
  };

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    const newUserMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, newUserMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, project }),
      });

      const data = await res.json();
      const newAssistantMsg: ChatMessage = res.ok
        ? { role: "assistant", content: data.answer, sources: data.sources, agentSteps: data.agentSteps }
        : { role: "assistant", content: `Error: ${data.error ?? "Something went wrong"}` };

      setMessages((prev) => [...prev, newAssistantMsg]);
      if (res.ok) setSources(data.sources ?? []);

      // Save to MongoDB history
      if (res.ok) {
        const histRes = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConvId,
            userMessage: question,
            assistantMessage: newAssistantMsg,
            project,
            title: question.slice(0, 60),
          }),
        });
        const histData = await histRes.json();

        if (!activeConvId && histData.conversationId) {
          setActiveConvId(histData.conversationId);
          // Add to sidebar
          setConversations((prev) => [
            {
              _id: histData.conversationId,
              title: question.slice(0, 60),
              project,
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error — is the server running?" }]);
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

        {/* History sidebar */}
        <div className={`flex flex-col border-r border-gray-800 bg-gray-950 transition-all duration-200 ${historySidebarOpen ? "w-60" : "w-0 overflow-hidden"}`}>
          <div className="p-3 border-b border-gray-800 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
            <button
              onClick={startNewChat}
              className="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded hover:bg-blue-950"
            >
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {conversations.length === 0 && (
              <p className="text-xs text-gray-600 px-4 py-3">No conversations yet.</p>
            )}
            {conversations.map((c) => (
              <div
                key={c._id}
                onClick={() => loadConversation(c._id)}
                className={`group flex items-start gap-2 px-3 py-2 cursor-pointer rounded-lg mx-2 transition ${
                  activeConvId === c._id ? "bg-gray-800" : "hover:bg-gray-900"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{c.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{c.project}</p>
                </div>
                <button
                  onClick={(e) => deleteConversation(c._id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition text-xs shrink-0 mt-0.5"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main chat column */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Top bar: toggle sidebar + project selector */}
          <div className="border-b border-gray-800 px-4 py-2.5 flex items-center gap-3 bg-gray-950 shrink-0">
            <button
              onClick={() => setHistorySidebarOpen((o) => !o)}
              className="text-gray-500 hover:text-white transition p-1 rounded"
              title="Toggle history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <span className="text-xs text-gray-500 shrink-0">Project:</span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500 transition"
            >
              <option value="auto">Auto (AI decides)</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span className="text-xs text-gray-600 hidden sm:block">
              Auto = AI picks the right namespace based on your question
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
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-200">{children}</li>,
                        code: ({ children }) => <code className="bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-blue-300">{children}</code>,
                        pre: ({ children }) => <pre className="bg-gray-700 rounded-lg p-3 overflow-x-auto text-xs font-mono mb-2">{children}</pre>,
                        h1: ({ children }) => <h1 className="text-base font-bold text-white mb-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold text-white mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold text-white mb-1">{children}</h3>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                  {msg.agentSteps && msg.agentSteps.length > 0 && (
                    <details className="mt-2 border-t border-gray-700 pt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                        Show reasoning ({msg.agentSteps.length} steps)
                      </summary>
                      <ol className="mt-2 space-y-1">
                        {msg.agentSteps.map((step, j) => (
                          <li key={j} className="text-xs text-gray-500">
                            <span className="text-gray-600 mr-1">{j + 1}.</span>{step}
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
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold mr-3 shrink-0">E</div>
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
          <div className="border-t border-gray-800 px-6 py-4 bg-gray-950 shrink-0">
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

        {/* Source panel — right */}
        <SourcePanel sources={sources} />
      </div>
    </div>
  );
}
