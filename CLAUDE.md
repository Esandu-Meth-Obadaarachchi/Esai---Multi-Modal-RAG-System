# ESAI — Esandu's Second-Brain AI

## What This Is

Multimodal RAG-powered AI agent that acts as a personal engineering knowledge base.
Users upload documents (PDF, DOCX, images, code, markdown) → stored as vectors in Pinecone → chat interface answers questions in Esandu's voice using retrieved context.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14.2.0, App Router, TypeScript |
| Styling | Tailwind CSS |
| Vector DB | Pinecone (`esai` index, 3072 dims, cosine) |
| LLM | Gemini 2.0 Flash |
| Embeddings | gemini-embedding-2-preview (3072-dim) via `@google/genai` |
| Image understanding | Gemini Vision → text description → embed |
| Agent framework | LangChain.js (`langchain`, `@langchain/google-genai`, `@langchain/core`) |
| Document parsing | pdf-parse (PDFs), mammoth (DOCX), raw Buffer (text/code/markdown) |
| Auth | NextAuth.js v4, credentials provider, 2 hardcoded users |

## Project Structure

```
app/
  (auth)/login/page.tsx          — Login form
  api/auth/[...nextauth]/        — NextAuth handler
  api/chat/route.ts              — Chat endpoint (Phase 3)
  api/ingest/route.ts            — Ingestion endpoint (Phase 2)
  chat/page.tsx                  — Chat UI page (Phase 3)
  upload/page.tsx                — Upload UI page (Phase 2)

components/
  Navbar.tsx                     — Top nav with Chat/Upload/Sign Out
  ChatWindow.tsx                 — Scrollable message thread
  MessageBubble.tsx              — Single message, includes AgentSteps
  SourcePanel.tsx                — Left sidebar showing retrieved chunks
  AgentSteps.tsx                 — Collapsible reasoning steps
  UploadZone.tsx                 — Drag-and-drop file uploader

lib/
  gemini.ts                      — Gemini Flash, embedText(), describeImage()
  pinecone.ts                    — Pinecone client + getPineconeIndex()
  chunker.ts                     — RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
  persona.ts                     — buildPersonaPrompt() — Esandu's system prompt
  parsers/pdf.ts                 — pdf-parse wrapper
  parsers/docx.ts                — mammoth wrapper
  parsers/image.ts               — calls describeImage() from gemini.ts
  parsers/text.ts                — raw Buffer → string
  langchain/tools.ts             — 4 tools: search_documents, cross_reference_projects,
                                   summarise_project, compare_approaches
  langchain/agent.ts             — createESAIAgent() using createOpenAIFunctionsAgent

types/index.ts                   — VectorMetadata, ChatMessage, RetrievedChunk, etc.
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
```

## Pinecone Index

Name: `esai` | Dimensions: `3072` | Metric: `cosine` | Pod: Starter (free)

Each vector metadata shape:
```typescript
{ text, source, type, project, pageNum?, imageDesc?, uploadedAt }
```

## Build Phases

| Phase | Status | What |
|---|---|---|
| 1 — Setup | **Done** | Project scaffold, auth, all config, npm install |
| 2 — Ingestion | **Done** | `/api/ingest`: parse → chunk → embed → Pinecone upsert + Upload UI |
| 3 — RAG Chat | **Done** | `/api/chat`: embed query → Pinecone → Gemini Flash + Chat UI |
| 4 — Multimodal | Pending | Image pipeline with Gemini Vision |
| 5 — Agent | Pending | LangChain agent + 4 tools wired into chat route |
| 6 — Evaluation | Pending | 20 Q&A test set, retrieval recall/correctness/faithfulness |
| 7 — AWS + CI/CD | Pending | EC2 + Nginx + PM2 + GitHub Actions |

## Running Locally

```bash
npm run dev       # starts on http://localhost:3000
npm run build     # production build
npm start         # run production build
```

Login at `/login` → redirects to `/chat`. Upload at `/upload`.

## Key Design Decisions

- **next.config.js not .ts** — Next.js 14.2.0 does not support `next.config.ts`, must use `.js`
- **serverComponentsExternalPackages** — `pdf-parse` and `mammoth` must be excluded from the client bundle
- **Plain-text passwords in .env.local** — acceptable for a 2-person private tool; hash before any public deployment
- **Pinecone index name** — user named it `esai` (not `esai-brain` as originally planned), reflected in `.env.local`
- **LangChain agent uses `createOpenAIFunctionsAgent`** — LangChain supports this with `ChatGoogleGenerativeAI` backend via `@langchain/google-genai`
