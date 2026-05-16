import { NextRequest, NextResponse } from "next/server";
import { embedQuery, generateResponse } from "@/lib/gemini";
import { getPineconeIndex, getPineconeNamespace, listProjects } from "@/lib/pinecone";
import { runESAIAgent } from "@/lib/langchain/agent";
import type { RetrievedChunk } from "@/types";

// Greetings and one-liners that never need document retrieval
const CONVERSATIONAL = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|good|great|cool|bye|goodbye|sup|what can you do|who are you|what are you|what's up|how are you|nice|awesome|perfect|got it|alright|noted)[\s!?.]*$/i;

function isConversational(question: string): boolean {
  return CONVERSATIONAL.test(question.trim());
}


async function resolveNamespaces(question: string, allProjects: string[]): Promise<string[]> {
  if (allProjects.length === 0) return [];
  if (allProjects.length === 1) return allProjects;

  const prompt = `You are helping route a question to the right project namespaces.

Available projects: ${allProjects.join(", ")}
Question: "${question}"

Which 1-3 projects are most relevant to this question? Reply with ONLY the project names from the list, comma-separated. If all are relevant or you cannot tell, reply with "all".`;

  const response = await generateResponse(prompt);
  const text = response.trim().toLowerCase();

  if (text === "all") return allProjects;

  const picked = allProjects.filter((p) => text.includes(p.toLowerCase()));
  return picked.length > 0 ? picked : allProjects;
}

async function queryNamespace(ns: ReturnType<typeof getPineconeNamespace>, vector: number[], topK: number) {
  const result = await ns.query({ vector, topK, includeMetadata: true });
  return result.matches ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = body.question?.trim();
    const project: string = body.project?.trim() || "auto";

    if (!question) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }

    // Skip Pinecone entirely for conversational messages
    if (isConversational(question)) {
      const { answer } = await runESAIAgent(question, "No documents needed for this message.", project);
      return NextResponse.json({ answer, sources: [], agentSteps: [] });
    }

    // Embed + retrieve
    const questionEmbedding = await embedQuery(question);
    let matches: Awaited<ReturnType<typeof queryNamespace>> = [];

    if (project !== "auto") {
      matches = await queryNamespace(getPineconeNamespace(project), questionEmbedding, 5);
    } else {
      const allProjects = await listProjects();

      if (allProjects.length === 0) {
        const result = await getPineconeIndex().query({
          vector: questionEmbedding,
          topK: 5,
          includeMetadata: true,
        });
        matches = result.matches ?? [];
      } else {
        const targetProjects = await resolveNamespaces(question, allProjects);
        const perNs = Math.ceil(5 / targetProjects.length);

        const results = await Promise.all(
          targetProjects.map((p) => queryNamespace(getPineconeNamespace(p), questionEmbedding, perNs))
        );

        matches = results
          .flat()
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 5);
      }
    }

    const sources: RetrievedChunk[] = matches
      .filter((m) => (m.score ?? 0) > 0.3)
      .map((m) => ({
        id: m.id,
        score: m.score ?? 0,
        metadata: m.metadata as unknown as RetrievedChunk["metadata"],
      }));

    const context =
      sources.length > 0
        ? sources
            .map((s, i) => `[Source ${i + 1} — ${s.metadata.source} (${s.metadata.project})]\n${s.metadata.text}`)
            .join("\n\n")
        : "No relevant documents found.";

    const { answer, agentSteps } = await runESAIAgent(question, context, project);

    return NextResponse.json({ answer, sources, agentSteps });
  } catch (err) {
    console.error("[chat] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
