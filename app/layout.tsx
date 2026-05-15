import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESAI — Esandu's Second-Brain AI",
  description: "Personal engineering knowledge base powered by RAG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
