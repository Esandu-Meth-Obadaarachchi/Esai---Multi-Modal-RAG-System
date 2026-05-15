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
| LLM | Gemini 2.5 Flash Lite |
| Embeddings | gemini-embedding-2-preview (3072-dim) via `@google/genai` |
| Image understanding | Gemini Vision → text description → embed |
| Agent framework | LangChain.js (`langchain`, `@langchain/google-genai`, `@langchain/core`) |
| Document parsing | pdf-parse (PDFs), mammoth (DOCX), raw Buffer (text/code/markdown) |
| Auth | NextAuth.js v4, credentials provider, 2 hardcoded users |
| Chat history | MongoDB Atlas (free M0), `mongodb` driver |
| Markdown rendering | `react-markdown` + `remark-gfm` |

## Project Structure

```
app/
  (auth)/login/page.tsx          — Login form
  api/auth/[...nextauth]/        — NextAuth handler
  api/chat/route.ts              — Chat: embed query → namespace routing → Gemini Flash
  api/ingest/route.ts            — Ingest: parse → chunk → embed → Pinecone namespace upsert
  api/projects/route.ts          — GET list of named Pinecone namespaces
  api/history/route.ts           — GET conversation list, POST save/append conversation
  api/history/[id]/route.ts      — GET single conversation, DELETE conversation
  chat/page.tsx                  — Chat page (server, auth-gated)
  chat/ChatClient.tsx            — Full chat UI: history sidebar, project dropdown, source panel, markdown rendering
  upload/page.tsx                — Upload page (server, auth-gated)
  upload/UploadClient.tsx        — Upload UI: project dropdown (existing + new), uploads table

components/
  Navbar.tsx                     — Top nav with Chat/Upload/Sign Out
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
  langchain/tools.ts             — 4 tools: search_documents, cross_reference_projects,
                                   summarise_project, compare_approaches (all use embedQuery)
  langchain/agent.ts             — createESAIAgent() using createOpenAIFunctionsAgent

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
| 5 — Agent | Pending | LangChain agent + 4 tools wired into chat route |
| 6 — Evaluation | Pending | 20 Q&A test set, retrieval recall/correctness/faithfulness |
| 7 — AWS + CI/CD | Pending | EC2 + Nginx + PM2 + GitHub Actions |

**Additional features shipped (not in original plan):**
- Per-project Pinecone namespaces (each project = its own namespace)
- Smart namespace routing — AI picks which namespaces to search in Auto mode
- Project dropdown on upload page — fetched live from Pinecone namespaces on load and after each upload
- Project dropdown on chat page — same live fetch, with "Auto" as default
- Chat history sidebar backed by MongoDB Atlas (load, delete conversations)
- Markdown rendering in assistant messages (react-markdown + remark-gfm)

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
