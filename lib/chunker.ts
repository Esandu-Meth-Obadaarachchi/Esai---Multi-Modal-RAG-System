import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export function getTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
}

export async function chunkText(text: string): Promise<string[]> {
  const splitter = getTextSplitter();
  const docs = await splitter.createDocuments([text]);
  return docs.map((doc) => doc.pageContent);
}
