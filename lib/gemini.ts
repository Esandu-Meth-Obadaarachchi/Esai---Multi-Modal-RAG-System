import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Text embedding
export async function embedText(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: text,
    config: { taskType: "RETRIEVAL_DOCUMENT" },
  });
  return response.embeddings![0].values!;
}

// Batch text embedding - use this in ingest pipeline, not embedText in a loop
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: texts,
    config: { taskType: "RETRIEVAL_DOCUMENT" },
  });
  return response.embeddings!.map((e) => e.values!);
}

// Query embedding - different taskType for questions vs documents
export async function embedQuery(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: text,
    config: { taskType: "RETRIEVAL_QUERY" },
  });
  return response.embeddings![0].values!;
}

// Flash for chat responses
export async function generateResponse(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });
  return response.text!;
}

// Image description via Vision
export async function describeImage(imageBase64: string, mimeType: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp",
            },
          },
          {
            text: "Describe this image in full technical detail. Include any text, diagrams, labels, data, charts, code, or architecture visible. Be exhaustive.",
          },
        ],
      },
    ],
  });
  return response.text!;
}