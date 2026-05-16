import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { queryPinecone } from "@/lib/pinecone";
import { embedQuery } from "@/lib/gemini";
import type { VectorMetadata } from "@/types";

export type TaskType =
  | "feature"
  | "bugfix"
  | "architecture"
  | "review"
  | "docs"
  | "research"
  | "unknown";

export const CLARIFYING_QUESTIONS: Record<TaskType, string[]> = {
  feature: [
    "Which project is this for?",
    "Which files or components will this touch?",
    "What should happen when it fails or the user does something unexpected?",
    "Are there any existing patterns in the codebase this must match?",
  ],
  bugfix: [
    "What did you expect to happen?",
    "What actually happened?",
    "Paste the full error message.",
    "Paste the code or file path where the error occurs.",
    "When did this start? Did anything change before it broke?",
  ],
  architecture: [
    "What are the specific options you are choosing between?",
    "What are your hard constraints — budget, timeline, team size?",
    "What do you prioritise most: speed of development, performance, cost or maintainability?",
    "What is the consequence of getting this decision wrong?",
  ],
  review: [
    "Which project and file is this from?",
    "What is the code supposed to do?",
    "What is your biggest concern about it?",
    "Is this going to production or is it a prototype?",
  ],
  docs: [
    "Who is the audience — other engineers, junior devs or external users?",
    "What format do you need — README, inline JSDoc or API reference?",
    "What is the most confusing part that must be explained well?",
  ],
  research: [
    "What are the two or three options you are comparing?",
    "What is your most important constraint — cost, performance, ease of use?",
    "Which project will this decision affect?",
  ],
  unknown: [
    "What are you trying to achieve in one sentence?",
    "Which project is this related to?",
    "What should the output look like — code, explanation, a decision, documentation?",
  ],
};

const ROLE_BY_TASK: Record<TaskType, string> = {
  feature:
    "You are a senior full-stack engineer with 10 years of experience in Next.js 14, TypeScript, LangChain.js and Pinecone. You write production-grade code with no shortcuts, no placeholder comments and explicit error handling on every async function.",
  bugfix:
    "You are a senior debugging engineer. You identify root causes, not symptoms. You fix the actual problem, not just the error message. You never guess — if you are uncertain, you say so and explain how to confirm the root cause.",
  architecture:
    "You are a principal software architect with experience shipping production AI systems. You think in trade-offs, not absolutes. You make concrete recommendations and do not give balanced non-answers.",
  review:
    "You are a senior engineer doing a rigorous code review. You care about correctness, security, performance and maintainability. You are direct. You do not soften criticism. You prioritise issues by severity.",
  docs:
    "You are a technical writer who has worked at Stripe and Vercel. You write documentation that is precise, scannable and never wastes the reader's time. You write for engineers, not beginners.",
  research:
    "You are a technical researcher who gives direct, opinionated recommendations based on specific constraints. You do not hedge. You do not give generic information available on Wikipedia. You give the answer specific to the given constraints.",
  unknown:
    "You are a senior software engineer and AI systems architect. You answer technical questions with precision, directness and specific actionable output.",
};

const OUTPUT_FORMAT_BY_TASK: Record<TaskType, string> = {
  feature: `For each file changed:
FILE: [path]
[complete file content]

Then:
ENVIRONMENT VARIABLES NEEDED: [list or "none"]
THINGS TO MANUALLY TEST: [numbered list]
POTENTIAL ISSUES TO WATCH: [list]`,

  bugfix: `ROOT CAUSE: [one paragraph — the actual cause, not the symptom]
FIX: [corrected code only, with file path]
WHY THIS WORKS: [one sentence]
RELATED RISKS: [anything else this change might affect]
HOW TO VERIFY THE FIX: [one test step]`,

  architecture: `RECOMMENDATION: [one sentence — pick one option]
WHY: [3 bullet points maximum]
TRADE-OFFS I AM ACCEPTING: [what is being given up]
HOW TO IMPLEMENT IT: [5-step numbered implementation path]
WHEN TO REVISIT THIS DECISION: [trigger condition]`,

  review: `CRITICAL (must fix before shipping): [numbered list]
MAJOR (should fix soon): [numbered list]
MINOR (nice to fix): [numbered list]
GOOD (what is done well — keep this): [list]
REVISED CODE: [rewrite only sections with critical or major issues, with file paths]`,

  docs: `## [Component / Function Name]
### What it does
### When to use it
### Parameters / Props [table format]
### Example usage [code block]
### Edge cases and gotchas`,

  research: `WINNER FOR MY USE CASE: [one answer, no hedging]
COMPARISON TABLE: [feature | option A | option B — 5 rows max]
WHY THE LOSER LOSES FOR MY CASE: [one paragraph]
MIGRATION PATH IF I SWITCH LATER: [brief, 3 steps]
FINAL RECOMMENDATION: [one direct paragraph]`,

  unknown: `ANSWER: [direct response]
CODE OR ACTION: [if applicable]
NEXT STEPS: [numbered list]`,
};

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

function scorePrompt(sections: {
  role: string;
  context: string;
  task: string;
  constraints: string[];
  outputFormat: string;
}): number {
  let score = 0;
  if (sections.role.length > 50) score += 1;
  if (sections.context.length > 100) score += 2;
  if (sections.task.length > 20 && sections.task.length < 300) score += 2;
  if (sections.constraints.length >= 3) score += 2;
  if (sections.outputFormat.length > 50) score += 1;
  score += 2; // chain of thought + XML tags always included
  return score;
}

function assemblePrompt(
  taskType: TaskType,
  context: string,
  task: string,
  constraints: string[],
  clarifications: Record<string, string>,
  retrievedSources: string[]
): string {
  const role = ROLE_BY_TASK[taskType];
  const outputFormat = OUTPUT_FORMAT_BY_TASK[taskType];

  const constraintBlock =
    constraints.length > 0
      ? constraints.map((c) => `- ${c}`).join("\n")
      : "- Match the existing code style exactly\n- Handle all error cases explicitly\n- Do not add unnecessary abstractions";

  const clarificationBlock = Object.entries(clarifications)
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join("\n\n");

  const score = scorePrompt({ role, context, task, constraints, outputFormat });

  const separator = "─".repeat(48);

  const esaiNotes = [
    `Confidence score: ${score}/10`,
    `Context retrieved from: ${retrievedSources.join(", ") || "general knowledge base"}`,
    score < 8
      ? "WARNING: Prompt scored below 8/10. Consider adding more specific constraints."
      : "Prompt quality is good. Paste directly into Claude.",
    "If Claude's answer does not match expectations, reply with: 'That is not quite right. The specific issue is [X]. Try again with this constraint: [Y]'",
  ];

  const prompt = `<role>
${role}
</role>

<project_context>
${context}

Additional context from your answers:
${clarificationBlock}
</project_context>

<task>
${task}
</task>

<constraints>
${constraintBlock}
- Use TypeScript with strict mode. No any types.
- Use async/await. Never .then() chains or callbacks.
- Handle errors with try/catch on every async function.
- Match the existing file naming conventions: kebab-case files, PascalCase components, camelCase functions.
</constraints>

<output_format>
${outputFormat}
</output_format>

Before writing your answer, think through the approach in 3 sentences. Identify any edge cases or risks. Then produce the output.

Verify your output satisfies all constraints before responding. If it does not, fix it first.`;

  return `${separator}
ESAI GENERATED PROMPT
Task Type: ${taskType.toUpperCase()}
${esaiNotes.join("\n")}
${separator}

${prompt}

${separator}
ESAI NOTES — do not paste into Claude:
${esaiNotes.slice(1).map((n) => `• ${n}`).join("\n")}
• Follow-up prompts you will likely need:
  1. "Now write tests for the code you just wrote."
  2. "What edge cases did you not handle in that solution?"
  3. "Refactor that to be more concise without losing functionality."
${separator}`;
}

export const buildPromptTool = new DynamicStructuredTool({
  name: "build_prompt",
  description:
    "Builds an optimised, context-rich prompt to paste into Claude. Use when the user wants help generating a Claude prompt for a coding task, bug fix, architecture decision, code review, documentation or research.",
  schema: z.object({
    rawInput: z.string().describe("The user's rough description of what they want to do"),
    clarifications: z.record(z.string()).optional().describe("Answers to clarifying questions, keyed by question text"),
    projectFilter: z.string().optional().describe("Project name to filter context retrieval"),
    additionalConstraints: z.array(z.string()).optional().describe("Extra constraints the user mentioned"),
  }),

  func: async ({ rawInput, clarifications = {}, projectFilter, additionalConstraints = [] }) => {
    try {
      const taskType = detectTaskType(rawInput);
      const requiredQuestions = CLARIFYING_QUESTIONS[taskType];
      const answeredQuestions = Object.keys(clarifications);
      const unansweredQuestions = requiredQuestions.filter(
        (q) => !answeredQuestions.some((a) => a.toLowerCase().includes(q.toLowerCase().slice(0, 20)))
      );

      if (unansweredQuestions.length > 0 && answeredQuestions.length === 0) {
        return JSON.stringify({
          status: "needs_clarification",
          taskType,
          questions: unansweredQuestions,
          message: `Detected task type: ${taskType}. Answer these questions to build the prompt:`,
        });
      }

      const queryText = projectFilter ? `${projectFilter} ${rawInput}` : rawInput;
      const queryVector = await embedQuery(queryText);
      const { matches } = await queryPinecone(queryVector, 6, projectFilter);

      const retrievedContext = (matches ?? [])
        .map((m) => {
          const meta = m.metadata as unknown as VectorMetadata;
          return `[Source: ${meta.source} | Project: ${meta.project} | Type: ${meta.type}]\n${meta.text}`;
        })
        .join("\n\n---\n\n");

      const allSources = (matches ?? []).map((m) => {
        const meta = m.metadata as unknown as VectorMetadata;
        return meta.source ?? "unknown";
      });
      const retrievedSources = Array.from(new Set(allSources));

      const contextBlock =
        retrievedContext.length > 0
          ? `Project Knowledge Retrieved:\n\n${retrievedContext}`
          : "No specific project context found. Using general engineering knowledge.";

      const prompt = assemblePrompt(
        taskType,
        contextBlock,
        rawInput,
        additionalConstraints,
        clarifications,
        retrievedSources
      );

      return JSON.stringify({ status: "prompt_ready", taskType, prompt, sourcesUsed: retrievedSources });
    } catch (err) {
      return JSON.stringify({
        status: "error",
        message: `Failed to build prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});
