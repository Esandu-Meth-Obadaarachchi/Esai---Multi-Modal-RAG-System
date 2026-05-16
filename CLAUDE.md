# ESAI — Esandu's Second-Brain AI

## What This Is

Multimodal RAG-powered AI agent that acts as a personal engineering knowledge base.
Users upload documents (PDF, DOCX, images, code, markdown) → stored as vectors in Pinecone (per-project namespaces) → chat interface answers questions in Esandu's voice using retrieved context. Chat history persisted in MongoDB.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14.2.0, App Router, TypeScript |
| Styling | Tailwind CSS |
| Vector DB | Pinecone (`esai` index, 3072 dims, cosine, per-project namespaces) |
| LLM | Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`) |
| Embeddings | gemini-embedding-2-preview (3072-dim) via `@google/genai` |
| Image understanding | Gemini Vision → text description → embed |
| Agent framework | Native Gemini function calling via `@google/genai` SDK (NOT LangChain agents) |
| Tool definitions | LangChain `DynamicStructuredTool` used for tool logic only — NOT for agent orchestration |
| Document parsing | pdf-parse (PDFs), mammoth (DOCX), raw Buffer (text/code/markdown) |
| Auth | NextAuth.js v4, credentials provider, 2 hardcoded users |
| Chat history | MongoDB Atlas (free M0), `mongodb` driver |
| Markdown rendering | `react-markdown` + `remark-gfm` |

## Project Structure

```
app/
  (auth)/login/page.tsx          — Login form
  api/auth/[...nextauth]/        — NextAuth handler
  api/chat/route.ts              — Chat: conversational check → embed → namespace routing →
                                   runESAIAgent() → answer + agentSteps + sources
  api/ingest/route.ts            — Ingest: parse → chunk → embed → Pinecone namespace upsert
  api/projects/route.ts          — GET list of named Pinecone namespaces (force-dynamic + noStore)
  api/history/route.ts           — GET conversation list, POST save/append conversation
  api/history/[id]/route.ts      — GET single conversation, DELETE conversation
  api/prompt-builder/route.ts    — POST with phase="detect" (Gemini generates questions) or
                                   phase="build" (resolve project → Pinecone → Gemini writes prompt)
  chat/page.tsx                  — Chat page (server, auth-gated)
  chat/ChatClient.tsx            — Full chat UI: history sidebar, project dropdown, source panel,
                                   markdown rendering, collapsible agent steps
  upload/page.tsx                — Upload page (server, auth-gated)
  upload/UploadClient.tsx        — Upload UI: project dropdown (existing + new), uploads table
  prompt-builder/page.tsx        — Prompt Builder page (server, auth-gated)
  prompt-builder/PromptBuilderClient.tsx — 3-phase UI: Describe → Clarify → Prompt Ready

components/
  Navbar.tsx                     — Top nav with Chat/Upload/Prompt Builder/Sign Out
  MessageBubble.tsx              — Single message with agent steps
  SourcePanel.tsx                — Right sidebar showing retrieved chunks with scores
  AgentSteps.tsx                 — Collapsible reasoning steps
  UploadZone.tsx                 — Drag-and-drop file uploader

lib/
  gemini.ts                      — embedText(), embedTexts(), embedQuery(), generateResponse(), describeImage()
                                   Uses @google/genai SDK. DO NOT change this file.
  pinecone.ts                    — getPineconeClient(), getPineconeIndex(), getPineconeNamespace(project),
                                   listProjects() — reads namespace names from describeIndexStats()
  mongodb.ts                     — MongoClient singleton, getDb(), ConversationDoc + MessageDoc types
  chunker.ts                     — RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
  persona.ts                     — buildPersonaPrompt(context) — Esandu's system prompt
  parsers/pdf.ts                 — pdf-parse wrapper
  parsers/docx.ts                — mammoth wrapper
  parsers/image.ts               — calls describeImage() from gemini.ts
  parsers/text.ts                — raw Buffer → string
  langchain/tools.ts             — createTools(defaultProject) factory — returns 4 DynamicStructuredTools:
                                   search_documents, cross_reference_projects, summarise_project,
                                   compare_approaches. All query per-project Pinecone namespaces.
  langchain/agent.ts             — runESAIAgent(question, context, project) — native Gemini function-calling
                                   loop (up to 5 iterations). Calls tools via tool.invoke(), builds
                                   multi-turn contents array, returns { answer, agentSteps }.
  langchain/tools/build-prompt.ts — Prompt Builder logic: detectTaskType() (regex), generateClarifyingQuestions()
                                   (Gemini decides what's missing), resolveProject() (case-insensitive namespace
                                   match from answers+input+filter), generatePromptWithGemini() (Gemini writes
                                   the actual prompt using retrieved Pinecone context), buildPromptTool
                                   (DynamicStructuredTool: resolve → embed → query 8 chunks → write prompt)

types/index.ts                   — VectorMetadata, ChatMessage, RetrievedChunk, IngestResponse, etc.
```

## Environment Variables

All secrets live in `.env.local` (never commit this file):

```
GEMINI_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME=esai
NEXTAUTH_SECRET
NEXTAUTH_URL
USER_1_EMAIL / USER_1_PASSWORD
USER_2_EMAIL / USER_2_PASSWORD
MONGODB_URI                      ← MongoDB Atlas connection string (required for chat history)
```

**Note:** If the MongoDB password contains special characters (e.g. `@`), URL-encode them (`@` → `%40`).

## Pinecone Index

Name: `esai` | Dimensions: `3072` | Metric: `cosine` | Pod: Starter (free)

**Namespaces:** Each project gets its own namespace. `listProjects()` calls `describeIndexStats()` and filters out `""` and `__default__` to return only user-created project namespaces.

Each vector metadata shape:
```typescript
{ text, source, type, project, pageNum?, imageDesc?, uploadedAt }
```

## MongoDB

Database: `esai` | Collection: `conversations`

Each conversation document:
```typescript
{
  _id: ObjectId,
  userId: string,
  title: string,       // first 60 chars of first question
  project: string,
  messages: [{ role, content, sources?, createdAt }],
  createdAt: Date,
  updatedAt: Date,
}
```

## Chat Flow (Phase 5 — current)

```
POST /api/chat
  │
  ├─ isConversational("Hi"?) → YES → runESAIAgent(no context) → return answer, no sources
  │
  └─ NO → embedQuery(question)
           → namespace routing (specific project OR Gemini picks 1-3 auto namespaces)
           → Pinecone query → sources + context string
           → runESAIAgent(question, context, project)
                 │
                 ├─ Gemini receives question + context in system prompt + 4 tool declarations
                 ├─ If Gemini calls a tool → execute via tool.invoke() → feed result back → repeat
                 └─ When Gemini returns text → { answer, agentSteps }
           → return { answer, sources, agentSteps }
```

## Prompt Builder Flow

```
POST /api/prompt-builder  (phase="detect")
  │
  └─ detectTaskType(rawInput) → regex classification (feature/bugfix/architecture/...)
     generateClarifyingQuestions(rawInput, taskType) → Gemini decides what's missing → string[]
     Return { taskType, questions }
     If questions.length === 0 → client skips clarify phase, calls build immediately

POST /api/prompt-builder  (phase="build")
  │
  └─ resolveProject(rawInput, clarifications, projectFilter)
       → case-insensitive match against listProjects() namespaces
       → returns exact namespace name or undefined (all namespaces)
     embedQuery(rawInput + additionalConstraints)
     queryPinecone(vector, 8, resolvedProject) → 8 most relevant chunks
     generatePromptWithGemini(rawInput, taskType, clarifications, retrievedContext)
       → Gemini writes specific Claude Code prompt using real file paths from context
     Return { status, taskType, prompt, sourcesUsed, resolvedProject, followUps }
```

## Chat Namespace Routing

The `/api/chat` route handles three cases:

1. **Specific project selected** → queries only that namespace directly
2. **Auto mode** → calls Gemini with the question + list of all namespace names, picks 1-3 most relevant, queries those and merges results by score
3. **No namespaces exist yet** → falls back to the default Pinecone namespace

## Build Phases

| Phase | Status | What |
|---|---|---|
| 1 — Setup | **Done** | Project scaffold, auth, all config, npm install |
| 2 — Ingestion | **Done** | `/api/ingest`: parse → chunk → embed → Pinecone namespace upsert + Upload UI |
| 3 — RAG Chat | **Done** | `/api/chat`: embed query → namespace routing → Gemini Flash + Chat UI |
| 4 — Multimodal | **Done** | Image pipeline with Gemini Vision (part of ingest) |
| 5 — Agent | **Done** | Native Gemini function-calling loop with 4 tools, agentSteps surfaced in UI |
| 6 — Evaluation | Pending | 20 Q&A test set, retrieval recall/correctness/faithfulness |
| 7 — AWS + CI/CD | Pending | EC2 + Nginx + PM2 + GitHub Actions |

**Additional features shipped (not in original plan):**
- Per-project Pinecone namespaces (each project = its own namespace)
- Smart namespace routing — AI picks which namespaces to search in Auto mode
- Project dropdown on upload page — fetched live from Pinecone namespaces on load and after each upload
- Project dropdown on chat page — same live fetch, with "Auto" as default
- Chat history sidebar backed by MongoDB Atlas (load, delete conversations)
- Markdown rendering in assistant messages (react-markdown + remark-gfm)
- Conversational intent check — greetings/one-liners skip Pinecone entirely
- Agent reasoning steps shown in collapsible UI under each assistant message
- **Prompt Builder** — 3-phase tool at `/prompt-builder`: describe rough idea → Gemini asks only necessary
  clarifying questions → retrieves real project context from Pinecone (8 chunks) → Gemini writes a specific,
  immediately-usable Claude Code prompt referencing actual file paths and patterns. Skips clarify phase
  automatically if no questions needed. Shows resolved namespace, sources used, and follow-up suggestions.

## Running Locally

```bash
npm run dev       # starts on http://localhost:3000
npm run build     # production build
npm start         # run production build
```

Login at `/login` → redirects to `/chat`. Upload at `/upload`.

## Key Design Decisions

- **next.config.js not .ts** — Next.js 14.2.0 does not support `next.config.ts`
- **serverComponentsExternalPackages** — `pdf-parse`, `mammoth`, AND `@pinecone-database/pinecone` must all be excluded from the Next.js client bundle. Without `@pinecone-database/pinecone` here, `describeIndexStats()` only returns the default namespace (stale cache bug — fix by deleting `.next/` and restarting)
- **Clear `.next/` after config changes** — `next.config.js` changes (especially `serverComponentsExternalPackages`) require deleting `.next/` and doing a full restart, not just hot reload
- **Plain-text passwords in .env.local** — acceptable for 2-person private tool; hash before public deployment
- **gemini.ts uses `@google/genai` SDK** — the newer unified Google AI SDK, not `@google/generative-ai`. DO NOT revert or change this file.
- **embedText vs embedQuery** — ingest uses `embedText` (RETRIEVAL_DOCUMENT task type), chat uses `embedQuery` (RETRIEVAL_QUERY task type). Intentional — improves retrieval quality.
- **Sequential embedding in ingest** — `embedTexts` batch API returns undefined values for some chunks; `embedText` in a sequential loop is reliable.
- **Pinecone namespace = project name** — namespace names are the source of truth for the project list; no separate DB table needed.
- **MongoDB optional** — if `MONGODB_URI` is missing, the app still runs; history API calls fail silently.
- **`__default__` filtered from project list** — Pinecone's internal default namespace name is excluded from dropdowns alongside the empty string namespace.
- **`/api/projects` is force-dynamic + noStore** — `export const dynamic = "force-dynamic"` and `noStore()` prevent Next.js from caching the namespace list. Without both, deleted/added namespaces won't appear until server restart.
- **Native Gemini function calling, not LangChain agents** — `createOpenAIFunctionsAgent` and `createToolCallingAgent` both fail with Gemini because LangChain's output parsers don't correctly translate Gemini's `{"functionCall":{...}}` wire format. The agent loop in `lib/langchain/agent.ts` uses `@google/genai` directly and calls `tool.invoke()` on the LangChain DynamicStructuredTools manually.
- **LangChain used for tools only** — `DynamicStructuredTool` from `@langchain/core` is kept for the Pinecone query logic and zod schema validation. The agent orchestration loop is custom.
- **gemini-2.5-flash-lite model** — used consistently in both `gemini.ts` and `lib/langchain/agent.ts`. Do NOT use `gemini-2.0-flash` — its free tier quota is exhausted.
- **Prompt Builder project resolution** — `resolveProject()` in `build-prompt.ts` scans all clarification answers + raw input against actual Pinecone namespace names (case-insensitive). The explicit project filter field takes priority, then text scanning. This is why project names mentioned in answers correctly resolve to the right namespace (e.g. "esai" in an answer matches the "ESAI" namespace).
- **Prompt Builder: Gemini generates clarifying questions** — `generateClarifyingQuestions()` calls Gemini with the raw request and task type; Gemini decides what specific information is missing. Returns `[]` if the request is self-contained, which auto-skips the clarify phase. Max 3 questions; avoids asking about things already in CLAUDE.md.
- **Prompt Builder: Gemini writes the prompt** — `generatePromptWithGemini()` passes the retrieved Pinecone context to Gemini and instructs it to write a specific prompt referencing actual file paths and patterns. The output notes that Claude Code has CLAUDE.md open rather than repeating that documentation.
