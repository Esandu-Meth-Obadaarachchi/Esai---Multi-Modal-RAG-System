"use client";

import { useState, useRef } from "react";

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.py,.js,.ts";

interface Props {
  project: string;
  onSuccess: (filename: string, chunks: number) => void;
}

export default function UploadZone({ project, onSuccess }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!project.trim()) {
      alert("Enter a project name before uploading.");
      return;
    }

    setUploading(true);
    setProgress(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", project);

    const res = await fetch("/api/ingest", { method: "POST", body: formData });
    const data = await res.json();

    if (res.ok) {
      onSuccess(file.name, data.chunksStored);
      setProgress("");
    } else {
      setProgress(`Error: ${data.error ?? "Upload failed"}`);
    }

    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition ${
        dragging ? "border-blue-500 bg-blue-950/20" : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleChange}
      />
      <svg className="w-10 h-10 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      {uploading ? (
        <p className="text-sm text-blue-400 animate-pulse">{progress}</p>
      ) : (
        <>
          <p className="text-sm text-gray-400">Drag & drop a file or click to browse</p>
          <p className="text-xs text-gray-600 mt-1">PDF, DOCX, TXT, MD, PNG, JPG, PY, JS, TS</p>
        </>
      )}
    </div>
  );
}
