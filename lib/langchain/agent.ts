import { GoogleGenAI } from "@google/genai";
import { createTools } from "./tools";
import { buildPersonaPrompt } from "@/lib/persona";

// Mirror the schema from tools.ts so Gemini knows what to call
const FUNCTION_DECLARATIONS = [
  {
    name: "search_documents",
    description:
      "Search the knowledge base for relevant document chunks. Use for any question needing document context.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        topK: { type: "number", description: "Number of results to return (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "cross_reference_projects",
    description: "Compare how something was done across two specific projects.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to compare" },
        projectA: { type: "string", description: "First project name" },
        projectB: { type: "string", description: "Second project name" },
      },
      required: ["query", "projectA", "projectB"],
    },
  },
  {
    name: "summarise_project",
    description: "Retrieve all key information about a specific project.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name to summarise" },
      },
      required: ["project"],
    },
  },
  {
    name: "compare_approaches",
    description: "Find how a technical topic has been handled across all projects.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The technical topic to search across all projects" },
      },
      required: ["topic"],
    },
  },
];

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: string; parts: GeminiPart[] };

function safeText(response: unknown): string | null {
  try {
    const text = (response as { text?: string }).text;
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function runESAIAgent(
  question: string,
  context: string,
  project: string = "auto"
): Promise<{ answer: string; agentSteps: string[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const tools = createTools(project);
  const toolMap = Object.fromEntries(
    tools.map((t) => [t.name, t as { name: string; invoke: (args: Record<string, unknown>) => Promise<string> }])
  );
  const agentSteps: string[] = [];
  const systemPrompt = buildPersonaPrompt(context);

  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: question }] }];

  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: contents as never,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] as never,
      },
    });

    // Check for a direct text answer first
    const directText = safeText(response);
    if (directText) return { answer: directText, agentSteps };

    // Otherwise inspect parts for a function call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = (response as any).candidates?.[0]?.content?.parts ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fcPart = parts.find((p: any) => p.functionCall);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textPart = parts.find((p: any) => typeof p.text === "string" && p.text.length > 0);

    if (textPart && !fcPart) {
      return { answer: String(textPart.text), agentSteps };
    }

    if (!fcPart) break; // nothing to act on

    const { name, args } = fcPart.functionCall as { name: string; args: Record<string, unknown> };

    agentSteps.push(
      `${name}(${Object.entries(args ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")})`
    );

    const tool = toolMap[name];
    let toolResult = "Tool not found";
    if (tool) {
      try {
        toolResult = await tool.invoke(args ?? {});
      } catch (err) {
        toolResult = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Add the model's function call and our function response to the conversation
    contents.push({ role: "model", parts: [{ functionCall: { name, args: args ?? {} } }] });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: { result: toolResult } } }],
    });
  }

  return { answer: "I was unable to generate a complete response.", agentSteps };
}
