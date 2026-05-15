import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI!;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (!global._mongoClientPromise) {
  const client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default clientPromise;

export async function getDb() {
  const client = await clientPromise;
  return client.db("esai");
}

export type { ObjectId };

export interface ConversationDoc {
  _id?: ObjectId;
  userId: string;
  title: string;
  project: string;
  messages: MessageDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
  createdAt: Date;
}
