import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import UploadClient from "./UploadClient";

export default async function UploadPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return <UploadClient />;
}
