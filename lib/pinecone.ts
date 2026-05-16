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

export async function queryPinecone(
  vector: number[],
  topK: number = 5,
  projectFilter?: string
) {
  if (projectFilter) {
    return getPineconeNamespace(projectFilter).query({ vector, topK, includeMetadata: true });
  }

  const projects = await listProjects();
  if (projects.length === 0) {
    return getPineconeIndex().query({ vector, topK, includeMetadata: true });
  }

  const perNs = Math.ceil(topK / projects.length);
  const results = await Promise.all(
    projects.map((p) => getPineconeNamespace(p).query({ vector, topK: perNs, includeMetadata: true }))
  );

  const merged = results
    .flatMap((r) => r.matches ?? [])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topK);

  return { matches: merged };
}
