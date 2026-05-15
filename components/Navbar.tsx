"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="h-14 border-b border-gray-800 bg-gray-950 flex items-center justify-between px-6">
      <span className="text-white font-bold tracking-tight">ESAI</span>
      <div className="flex items-center gap-6">
        <Link
          href="/chat"
          className={`text-sm transition ${pathname === "/chat" ? "text-white" : "text-gray-400 hover:text-white"}`}
        >
          Chat
        </Link>
        <Link
          href="/upload"
          className={`text-sm transition ${pathname === "/upload" ? "text-white" : "text-gray-400 hover:text-white"}`}
        >
          Upload
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-400 hover:text-red-400 transition"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}
