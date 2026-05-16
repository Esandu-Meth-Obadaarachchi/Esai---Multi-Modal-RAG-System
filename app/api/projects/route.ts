import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { listProjects } from "@/lib/pinecone";

export const dynamic = "force-dynamic";

export async function GET() {
  noStore();
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[projects] error:", err);
    return NextResponse.json({ projects: [] });
  }
}
