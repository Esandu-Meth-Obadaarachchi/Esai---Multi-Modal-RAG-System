import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, type ConversationDoc } from "@/lib/mongodb";

// GET /api/history/[id] — load a full conversation
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const conversation = await db
      .collection<ConversationDoc>("conversations")
      .findOne({ _id: new ObjectId(params.id) });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (err) {
    console.error("[history/id GET] error:", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

// DELETE /api/history/[id] — delete a conversation
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    await db
      .collection<ConversationDoc>("conversations")
      .deleteOne({ _id: new ObjectId(params.id) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[history/id DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
