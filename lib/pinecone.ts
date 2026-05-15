import { Pinecone } from "@pinecone-database/pinecone";

let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return pineconeClient;
}

export function getPineconeIndex() {
  return getPineconeClient().index(process.env.PINECONE_INDEX_NAME!);
}

export function getPineconeNamespace(project: string) {
  return getPineconeIndex().namespace(project);
}

export async function listProjects(): Promise<string[]> {
  const stats = await getPineconeIndex().describeIndexStats();
  return Object.keys(stats.namespaces ?? {}).filter(
    (ns) => ns !== "" && ns !== "__default__"
  );
}
