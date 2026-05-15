import { NextRequest, NextResponse } from "next/server";
import { embedQuery, generateResponse } from "@/lib/gemini";
import { getPineconeIndex } from "@/lib/pinecone";
import { buildPersonaPrompt } from "@/lib/persona";
import type { RetrievedChunk } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = body.question?.trim();
    const project: string | undefined = body.project?.trim() || undefined;

    if (!question) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }

    // 1. Embed the question using query task type
    const questionEmbedding = await embedQuery(question);

    // 2. Query Pinecone — filter by project if provided
    const index = getPineconeIndex();
    const queryOptions: Parameters<typeof index.query>[0] = {
      vector: questionEmbedding,
      topK: 5,
      includeMetadata: true,
    };
    if (project && project !== "all") {
      queryOptions.filter = { project };
    }

    const results = await index.query(queryOptions);

    // 3. Build retrieved chunks array for the response
    const sources: RetrievedChunk[] = (results.matches ?? [])
      .filter((m) => m.score && m.score > 0.3)
      .map((m) => ({
        id: m.id,
        score: m.score ?? 0,
        metadata: m.metadata as RetrievedChunk["metadata"],
      }));

    // 4. Build context string from retrieved chunks
    const context =
      sources.length > 0
        ? sources
            .map(
              (s, i) =>
                `[Source ${i + 1} — ${s.metadata.source} (${s.metadata.project})]\n${s.metadata.text}`
            )
            .join("\n\n")
        : "No relevant documents found.";

    // 5. Build persona prompt and call Gemini Flash
    const fullPrompt = `${buildPersonaPrompt(context)}\n\nQuestion: ${question}`;
    const answer = await generateResponse(fullPrompt);

    return NextResponse.json({ answer, sources, agentSteps: [] });
  } catch (err) {
    console.error("[chat] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
