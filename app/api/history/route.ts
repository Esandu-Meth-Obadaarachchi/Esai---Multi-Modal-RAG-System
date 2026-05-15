import { NextRequest, NextResponse } from "next/server";
import { getDb, type ConversationDoc, type MessageDoc } from "@/lib/mongodb";

// GET /api/history — list all conversations (summary only)
export async function GET() {
  try {
    const db = await getDb();
    const conversations = await db
      .collection<ConversationDoc>("conversations")
      .find({}, { projection: { messages: 0 } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[history GET] error:", err);
    return NextResponse.json({ conversations: [] });
  }
}

// POST /api/history — create a new conversation or append messages to existing one
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, userMessage, assistantMessage, project, title } = body;
    const db = await getDb();
    const col = db.collection<ConversationDoc>("conversations");

    const userMsg: MessageDoc = {
      role: "user",
      content: userMessage,
      createdAt: new Date(),
    };
    const assistantMsg: MessageDoc = {
      role: "assistant",
      content: assistantMessage.content,
      sources: assistantMessage.sources ?? [],
      createdAt: new Date(),
    };

    if (conversationId) {
      const { ObjectId } = await import("mongodb");
      await col.updateOne(
        { _id: new ObjectId(conversationId) },
        {
          $push: { messages: { $each: [userMsg, assistantMsg] } },
          $set: { updatedAt: new Date() },
        }
      );
      return NextResponse.json({ conversationId });
    } else {
      const doc: ConversationDoc = {
        userId: "esandu",
        title: title ?? userMessage.slice(0, 60),
        project: project ?? "all",
        messages: [userMsg, assistantMsg],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await col.insertOne(doc);
      return NextResponse.json({ conversationId: result.insertedId.toString() });
    }
  } catch (err) {
    console.error("[history POST] error:", err);
    return NextResponse.json({ error: "Failed to save history" }, { status: 500 });
  }
}
