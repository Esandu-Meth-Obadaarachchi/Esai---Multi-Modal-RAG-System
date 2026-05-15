"use client";

import { useState } from "react";
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
  const [project, setProject] = useState("");
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [successMsg, setSuccessMsg] = useState("");

  function handleSuccess(filename: string, chunks: number) {
    const record: UploadRecord = {
      filename,
      type: getFileType(filename),
      project: project.trim() || "general",
      chunks,
      date: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    };
    setUploads((prev) => [record, ...prev]);
    setSuccessMsg(`${filename} — ${chunks} chunks stored`);
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Upload Documents</h1>
          <p className="text-gray-400 text-sm mt-1">
            Add files to your knowledge base. Tag them with a project so you can filter later.
          </p>
        </div>

        {/* Project tag */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Project tag <span className="text-gray-600">(required before uploading)</span>
          </label>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. PowerProx, thesis, hotel-tech"
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition text-sm"
          />
        </div>

        {/* Upload zone */}
        <UploadZone project={project} onSuccess={handleSuccess} />

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
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Recent Uploads
            </h2>
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
                    <tr
                      key={i}
                      className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50 transition"
                    >
                      <td className="px-4 py-3 text-white truncate max-w-[200px]">{u.filename}</td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full">
                          {u.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-950 text-blue-300 text-xs px-2 py-1 rounded-full">
                          {u.project}
                        </span>
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

        {/* Accepted formats */}
        <p className="text-xs text-gray-600">
          Accepted: PDF, DOCX, TXT, MD, PNG, JPG, JPEG, PY, JS, TS
        </p>
      </main>
    </div>
  );
}
