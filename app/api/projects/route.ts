import { NextResponse } from "next/server";
import { listProjects } from "@/lib/pinecone";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[projects] error:", err);
    return NextResponse.json({ projects: [] });
  }
}
