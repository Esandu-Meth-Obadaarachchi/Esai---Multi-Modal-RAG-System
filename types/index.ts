export interface VectorMetadata {
  text: string;
  source: string;
  type: "pdf" | "docx" | "image" | "code" | "markdown" | "text";
  project: string;
  pageNum?: number;
  imageDesc?: string;
  uploadedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: RetrievedChunk[];
  agentSteps?: string[];
}

export interface RetrievedChunk {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface IngestResponse {
  chunksStored: number;
  filename: string;
  project: string;
}

export interface ChatRequest {
  question: string;
  project?: string;
}

export interface ChatResponse {
  answer: string;
  sources: RetrievedChunk[];
  agentSteps: string[];
}
