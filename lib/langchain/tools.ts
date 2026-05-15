import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { embedQuery } from "@/lib/gemini";
import { getPineconeIndex } from "@/lib/pinecone";

export const searchDocuments = new DynamicStructuredTool({
  name: "search_documents",
  description: "Search the knowledge base for relevant document chunks. Use for any question needing document context.",
  schema: z.object({
    query: z.string().describe("The search query"),
    topK: z.number().default(5).describe("Number of results to return"),
  }),
  func: async ({ query, topK }) => {
    const embedding = await embedQuery(query);
    const index = getPineconeIndex();
    const results = await index.query({ vector: embedding, topK, includeMetadata: true });
    return JSON.stringify(results.matches.map((m) => ({ score: m.score, metadata: m.metadata })));
  },
});

export const crossReferenceProjects = new DynamicStructuredTool({
  name: "cross_reference_projects",
  description: "Compare how something was done across two specific projects.",
  schema: z.object({
    query: z.string().describe("What to compare"),
    projectA: z.string().describe("First project name"),
    projectB: z.string().describe("Second project name"),
  }),
  func: async ({ query, projectA, projectB }) => {
    const embedding = await embedQuery(query);
    const index = getPineconeIndex();

    const [resA, resB] = await Promise.all([
      index.query({ vector: embedding, topK: 3, includeMetadata: true, filter: { project: projectA } }),
      index.query({ vector: embedding, topK: 3, includeMetadata: true, filter: { project: projectB } }),
    ]);

    return JSON.stringify({
      [projectA]: resA.matches.map((m) => m.metadata),
      [projectB]: resB.matches.map((m) => m.metadata),
    });
  },
});

export const summariseProject = new DynamicStructuredTool({
  name: "summarise_project",
  description: "Retrieve all key information about a specific project.",
  schema: z.object({
    project: z.string().describe("The project name to summarise"),
  }),
  func: async ({ project }) => {
    const embedding = await embedQuery(`summary overview of ${project}`);
    const index = getPineconeIndex();
    const results = await index.query({
      vector: embedding,
      topK: 10,
      includeMetadata: true,
      filter: { project },
    });
    return JSON.stringify(results.matches.map((m) => m.metadata));
  },
});

export const compareApproaches = new DynamicStructuredTool({
  name: "compare_approaches",
  description: "Find how a technical topic has been handled across all projects.",
  schema: z.object({
    topic: z.string().describe("The technical topic to search across all projects"),
  }),
  func: async ({ topic }) => {
    const embedding = await embedQuery(topic);
    const index = getPineconeIndex();
    const results = await index.query({ vector: embedding, topK: 8, includeMetadata: true });
    return JSON.stringify(results.matches.map((m) => ({ score: m.score, metadata: m.metadata })));
  },
});
