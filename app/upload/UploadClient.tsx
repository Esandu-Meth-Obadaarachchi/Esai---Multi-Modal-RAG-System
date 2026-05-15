"use client";

import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import UploadZone from "@/components/UploadZone";

interface UploadRecord {
  filename: string;
  type: string;
  project: string;
  chunks: number;
  date: string;
}

function getFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Word";
  if (["png", "jpg", "jpeg"].includes(ext)) return "Image";
  if (["md", "markdown"].includes(ext)) return "Markdown";
  if (["py", "js", "ts", "tsx", "jsx"].includes(ext)) return "Code";
  return "Text";
}

export default function UploadClient() {
  const [existingProjects, setExistingProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [newProject, setNewProject] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [successMsg, setSuccessMsg] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setExistingProjects(data.projects ?? []);
        if ((data.projects ?? []).length === 0) setShowNewInput(true);
      })
      .catch(() => setShowNewInput(true));
  }, []);

  useEffect(() => {
    if (showNewInput) newInputRef.current?.focus();
  }, [showNewInput]);

  const activeProject = showNewInput ? newProject.trim() : project;

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === "__new__") {
      setShowNewInput(true);
      setProject("");
    } else {
      setShowNewInput(false);
      setProject(val);
    }
  }

  function handleSuccess(filename: string, chunks: number) {
    const record: UploadRecord = {
      filename,
      type: getFileType(filename),
      project: activeProject || "general",
      chunks,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    };
    setUploads((prev) => [record, ...prev]);

    // Re-fetch the full project list from Pinecone so all namespaces appear
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const fetched: string[] = data.projects ?? [];
        setExistingProjects(fetched);
        if (fetched.length > 0) setShowNewInput(false);
      })
      .catch(() => {});

    setSuccessMsg(`${filename} — ${chunks} chunks stored in "${record.project}"`);
    setTimeout(() => setSuccessMsg(""), 5000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Upload Documents</h1>
          <p className="text-gray-400 text-sm mt-1">
            Tag each file with a project so they go into the right namespace.
          </p>
        </div>

        {/* Project selector */}
        <div className="space-y-3">
          <label className="block text-sm text-gray-400">Project</label>

          {existingProjects.length > 0 && (
            <select
              value={showNewInput ? "__new__" : project}
              onChange={handleSelect}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-blue-500 transition text-sm"
            >
              <option value="" disabled>Select a project…</option>
              {existingProjects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__new__">+ New project…</option>
            </select>
          )}

          {showNewInput && (
            <input
              ref={newInputRef}
              type="text"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              placeholder="Enter new project name…"
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-blue-500 text-white placeholder-gray-500 focus:outline-none transition text-sm"
            />
          )}

          {showNewInput && existingProjects.length > 0 && (
            <button
              onClick={() => { setShowNewInput(false); setNewProject(""); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
            >
              ← Back to existing projects
            </button>
          )}
        </div>

        {/* Upload zone */}
        <UploadZone project={activeProject} onSuccess={handleSuccess} />

        {/* Success banner */}
        {successMsg && (
          <div className="flex items-center gap-3 bg-green-950 border border-green-800 text-green-300 text-sm px-4 py-3 rounded-lg">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* Recent uploads table */}
        {uploads.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Uploads</h2>
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">File</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Project</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Chunks</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u, i) => (
                    <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50 transition">
                      <td className="px-4 py-3 text-white truncate max-w-[180px]">{u.filename}</td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full">{u.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-950 text-blue-300 text-xs px-2 py-1 rounded-full">{u.project}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{u.chunks}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{u.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-600">Accepted: PDF, DOCX, TXT, MD, PNG, JPG, JPEG, PY, JS, TS</p>
      </main>
    </div>
  );
}
