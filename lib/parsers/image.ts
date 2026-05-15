import { describeImage } from "@/lib/gemini";

export async function parseImage(buffer: Buffer, mimeType: string): Promise<string> {
  const base64 = buffer.toString("base64");
  return describeImage(base64, mimeType);
}
