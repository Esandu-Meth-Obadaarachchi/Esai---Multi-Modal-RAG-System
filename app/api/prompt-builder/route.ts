import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildPromptTool,
  detectTaskType,
  generateClarifyingQuestions,
} from "@/lib/langchain/tools/build-prompt";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rawInput, clarifications, projectFilter, additionalConstraints, phase } = body as {
      rawInput: string;
      clarifications?: Record<string, string>;
      projectFilter?: string;
      additionalConstraints?: string[];
      phase: "detect" | "build";
    };

    if (phase === "detect") {
      const taskType = detectTaskType(rawInput);
      // Gemini decides what's actually missing from this specific request
      const questions = await generateClarifyingQuestions(rawInput, taskType);
      return NextResponse.json({ taskType, questions });
    }

    if (phase === "build") {
      const result = await buildPromptTool.invoke({
        rawInput,
        clarifications,
        projectFilter,
        additionalConstraints,
      });

      const parsed = JSON.parse(result) as {
        status: string;
        taskType?: string;
        prompt?: string;
        sourcesUsed?: string[];
        resolvedProject?: string;
        followUps?: string[];
        message?: string;
      };
      return NextResponse.json(parsed);
    }

    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  } catch (err) {
    console.error("[prompt-builder] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
