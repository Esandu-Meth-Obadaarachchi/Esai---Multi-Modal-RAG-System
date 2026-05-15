"use client";

import { ChatMessage } from "@/types";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-600 text-sm">Ask anything from your knowledge base.</p>
        </div>
      )}
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
      {loading && (
        <div className="flex gap-2 items-center text-gray-500 text-sm">
          <span className="animate-pulse">Thinking...</span>
        </div>
      )}
    </div>
  );
}
