import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import PromptBuilderClient from "./PromptBuilderClient";

export default async function PromptBuilderPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return <PromptBuilderClient />;
}
