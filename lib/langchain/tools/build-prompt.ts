import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { queryPinecone, listProjects } from "@/lib/pinecone";
import { embedQuery, generateResponse } from "@/lib/gemini";
import type { VectorMetadata } from "@/types";

export type TaskType =
  | "feature"
  | "bugfix"
  | "architecture"
  | "review"
  | "docs"
  | "research"
  | "unknown";

export function detectTaskType(input: string): TaskType {
  const lower = input.toLowerCase();
  if (/build|implement|add|create|feature|integrate/.test(lower)) return "feature";
  if (/bug|error|fix|broken|crash|not working|failing/.test(lower)) return "bugfix";
  if (/architecture|design|decide|choose|\bvs\b|versus|which/.test(lower)) return "architecture";
  if (/review|check|audit|improve|refactor/.test(lower)) return "review";
  if (/document|docs|readme|comment|explain this code/.test(lower)) return "docs";
  if (/compare|research|difference|pros and cons/.test(lower)) return "research";
  return "unknown";
}

// Ask Gemini what's actually missing from this specific request
export async function generateClarifyingQuestions(
  rawInput: string,
  taskType: string
): Promise<string[]> {
  const prompt = `You are helping build an optimised prompt for Claude Code — an AI coding assistant that already has access to the project's CLAUDE.md file, which contains the full architecture, tech stack, file structure, and design decisions.

The developer wants to: "${rawInput}"
Task type detected: ${taskType}

Think carefully about what specific information is MISSING from this request to write a complete, actionable Claude prompt.

Rules:
- Claude already has CLAUDE.md, so do NOT ask about things like the tech stack, file structure, or project architecture — those are already documented
- Only ask what's truly necessary for THIS specific request
- Do not ask about things already stated or implied in the request
- If the request is self-contained enough, return fewer questions or none at all
- Maximum 3 questions
- Make questions concrete and specific to this request — not generic checklist items

Return ONLY a valid JSON array of question strings.
If no clarification is needed, return: []

Examples of good questions:
- "What should happen when the upload fails midway — silent fail, show an error, or retry?"
- "Should this new button replace the existing one or appear alongside it?"
- "Paste the exact error message you are seeing."

Examples of bad questions (do not ask these):
- "Which project is this for?" (ask this only if the project is genuinely ambiguous and not inferable)
- "What tech stack are you using?" (already in CLAUDE.md)
- "What files will this touch?" (Claude can figure this out from context)

Return only the JSON array, nothing else.`;

  try {
    const response = await generateResponse(prompt);
    const match = response.match(/\[[\s\S]*?\]/);
    if (match) return JSON.parse(match[0]) as string[];
    return [];
  } catch {
    return [];
  }
}

// Match the user's project mention against actual Pinecone namespaces (case-insensitive)
async function resolveProject(
  rawInput: string,
  answers: Record<string, string>,
  explicitFilter?: string
): Promise<string | undefined> {
  const allProjects = await listProjects();
  if (allProjects.length === 0) return undefined;

  // 1. Explicit project filter field takes priority
  if (explicitFilter?.trim()) {
    const match = allProjects.find(
      (p) => p.toLowerCase() === explicitFilter.trim().toLowerCase()
    );
    if (match) return match;
  }

  // 2. Scan all answers + raw input for any known project name
  const allText = [...Object.values(answers), rawInput].join(" ").toLowerCase();
  for (const project of allProjects) {
    if (allText.includes(project.toLowerCase())) return project;
  }

  return undefined; // will fall back to querying all namespaces
}

// Use Gemini to write an actual specific prompt — not fill a template
async function generatePromptWithGemini(
  rawInput: string,
  taskType: string,
  answers: Record<string, string>,
  retrievedContext: string
): Promise<string> {
  const answersBlock =
    Object.keys(answers).length > 0
      ? Object.entries(answers)
          .map(([q, a]) => `${q}\n→ ${a}`)
          .join("\n\n")
      : "No additional answers provided.";

  const prompt = `You are an expert at writing prompts for Claude Code — an AI coding assistant with full terminal, file read/write, and bash access.

The developer wants to do this:
"${rawInput}"

Task type: ${taskType}

They answered these clarifying questions:
${answersBlock}

Here is relevant code, architecture, and patterns retrieved from the project's knowledge base:
---
${retrievedContext}
---

Write a complete, specific, immediately-usable prompt for Claude Code.

Requirements:
- Reference the actual file paths, function names, and code patterns visible in the retrieved context above — make it specific, not generic
- Claude already has the project's CLAUDE.md file open — do not repeat what is documented there. Instead write "Claude Code has CLAUDE.md open — refer to it for the full stack and design decisions" in the context section
- The prompt must be specific enough that Claude does not need to ask any follow-up questions
- Derive constraints from what you can see in the retrieved code patterns (naming conventions, error handling style, existing patterns to match)
- For a feature request: name the exact files to modify and describe what the change must integrate with
- For a bug: identify the likely cause from the retrieved context and point to exactly where to fix it
- Use XML tags for structure: <task>, <context>, <constraints>, <output_format>
- End with: "Think through the approach in 2 sentences before writing any code. Then implement."

Write only the prompt. No preamble. No "here is your prompt". Just the prompt itself, starting with <task>.`;

  return generateResponse(prompt);
}

export const buildPromptTool = new DynamicStructuredTool({
  name: "build_prompt",
  description:
    "Builds an optimised, context-rich prompt to paste into Claude Code. Retrieves real project context from the knowledge base and uses Gemini to write a specific, actionable prompt.",
  schema: z.object({
    rawInput: z.string().describe("The user's rough description of what they want to do"),
    clarifications: z
      .record(z.string())
      .optional()
      .describe("Answers to clarifying questions, keyed by question text"),
    projectFilter: z
      .string()
      .optional()
      .describe("Project name from the filter input field"),
    additionalConstraints: z
      .array(z.string())
      .optional()
      .describe("Extra constraints the user mentioned"),
  }),

  func: async ({ rawInput, clarifications = {}, projectFilter, additionalConstraints = [] }) => {
    try {
      const taskType = detectTaskType(rawInput);

      // Resolve actual Pinecone namespace from answers + raw input + explicit filter
      const resolvedProject = await resolveProject(rawInput, clarifications, projectFilter);

      // Build query: combine raw input with any additional constraints for better retrieval
      const queryText = [rawInput, ...additionalConstraints].join(" ");
      const queryVector = await embedQuery(queryText);
      const { matches } = await queryPinecone(queryVector, 8, resolvedProject);

      const retrievedContext =
        (matches ?? []).length > 0
          ? (matches ?? [])
              .map((m) => {
                const meta = m.metadata as unknown as VectorMetadata;
                return `[${meta.source} | ${meta.project} | ${meta.type}]\n${meta.text}`;
              })
              .join("\n\n---\n\n")
          : "No specific project context found in the knowledge base.";

      const allSources = (matches ?? []).map((m) => {
        const meta = m.metadata as unknown as VectorMetadata;
        return meta.source ?? "unknown";
      });
      const sourcesUsed = Array.from(new Set(allSources));

      const prompt = await generatePromptWithGemini(
        rawInput,
        taskType,
        clarifications,
        retrievedContext
      );

      const followUps = [
        "Now write tests for the code you just wrote.",
        "What edge cases did you not handle in that solution?",
        "Refactor that to be more concise without losing any functionality.",
      ];

      return JSON.stringify({
        status: "prompt_ready",
        taskType,
        prompt,
        sourcesUsed,
        resolvedProject: resolvedProject ?? "all namespaces",
        followUps,
      });
    } catch (err) {
      return JSON.stringify({
        status: "error",
        message: `Failed to build prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});
