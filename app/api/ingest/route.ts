import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { PineconeRecord } from "@pinecone-database/pinecone";
import { embedText } from "@/lib/gemini";
import { getPineconeNamespace } from "@/lib/pinecone";
import { chunkText } from "@/lib/chunker";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";
import { parseImage } from "@/lib/parsers/image";
import { parseText } from "@/lib/parsers/text";
import type { VectorMetadata } from "@/types";

function getFileType(filename: string): VectorMetadata["type"] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (["md", "markdown"].includes(ext)) return "markdown";
  return "text";
}

async function extractText(
  buffer: Buffer,
  filename: string,
  type: VectorMetadata["type"]
): Promise<{ text: string; imageDesc?: string }> {
  if (type === "pdf") return { text: await parsePdf(buffer) };
  if (type === "docx") return { text: await parseDocx(buffer) };
  if (type === "image") {
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    };
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const desc = await parseImage(buffer, mimeMap[ext] ?? "image/jpeg");
    return { text: desc, imageDesc: desc };
  }
  return { text: await parseText(buffer) };
}

async function upsertInBatches(
  ns: ReturnType<typeof getPineconeNamespace>,
  vectors: PineconeRecord[]
) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await ns.upsert(vectors.slice(i, i + BATCH_SIZE));
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const project = (formData.get("project") as string | null)?.trim() || "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name;
    const type = getFileType(filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, imageDesc } = await extractText(buffer, filename, type);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
    }

    const chunks = await chunkText(text);
    const uploadedAt = new Date().toISOString();
    const docId = uuidv4();

    const vectors: PineconeRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const values = await embedText(chunks[i]);
      const metadata: PineconeRecord["metadata"] = {
        text: chunks[i],
        source: filename,
        type,
        project,
        uploadedAt,
      };
      if (imageDesc) metadata!.imageDesc = imageDesc;
      vectors.push({ id: `${docId}-${i}`, values, metadata });
    }

    // Upsert into the project's own namespace
    const ns = getPineconeNamespace(project);
    await upsertInBatches(ns, vectors);

    return NextResponse.json({ chunksStored: vectors.length, filename, project });
  } catch (err) {
    console.error("[ingest] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
