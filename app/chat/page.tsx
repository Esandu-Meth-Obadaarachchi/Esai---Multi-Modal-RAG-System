import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import ChatClient from "./ChatClient";

export default async function ChatPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return <ChatClient />;
}
