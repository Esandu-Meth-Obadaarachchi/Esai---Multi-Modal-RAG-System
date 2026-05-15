"use client";

import { RetrievedChunk } from "@/types";

interface Props {
  sources: RetrievedChunk[];
}

export default function SourcePanel({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="w-72 border-l border-gray-800 bg-gray-950 p-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sources</h3>
      <div className="space-y-3">
        {sources.map((chunk, i) => (
          <div key={i} className="rounded-lg bg-gray-900 border border-gray-800 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-400 truncate">{chunk.metadata.source}</span>
              <span className="text-xs text-gray-600 ml-2">{(chunk.score * 100).toFixed(0)}%</span>
            </div>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {chunk.metadata.project}
            </span>
            <p className="text-xs text-gray-400 mt-2 line-clamp-3">{chunk.metadata.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
