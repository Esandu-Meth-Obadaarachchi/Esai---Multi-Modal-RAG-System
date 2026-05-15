"use client";

import { ChatMessage } from "@/types";
import AgentSteps from "./AgentSteps";

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-800 text-gray-100 rounded-bl-sm"
        }`}
      >
        {message.content}
        {message.agentSteps && message.agentSteps.length > 0 && (
          <AgentSteps steps={message.agentSteps} />
        )}
      </div>
    </div>
  );
}
