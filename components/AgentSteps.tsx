"use client";

import { useState } from "react";

interface Props {
  steps: string[];
}

export default function AgentSteps({ steps }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-700 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-500 hover:text-gray-300 transition"
      >
        {open ? "Hide" : "Show"} reasoning steps ({steps.length})
      </button>
      {open && (
        <ol className="mt-2 space-y-1">
          {steps.map((step, i) => (
            <li key={i} className="text-xs text-gray-500">
              <span className="text-gray-600 mr-1">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
