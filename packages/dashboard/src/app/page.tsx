"use client";

import { useEffect, useState } from "react";

interface SystemStatus {
  gateway: string;
  sessions: number;
  uptime: number;
  memoryMB: number;
  subsystems: Record<string, string>;
}

export default function Home() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  return (
    <main className="flex min-h-screen">
      {/* Sidebar */}
      <nav className="w-56 border-r border-zinc-800 p-4 flex flex-col gap-2">
        <h1 className="text-lg font-bold mb-4 text-emerald-400">
          SCB Mission Control
        </h1>
        <NavLink href="/chat" label="Chat" active />
        <NavLink href="/status" label="Status" />
        <NavLink href="/kanban" label="Kanban" />
        <NavLink href="/workflows" label="Workflows" />
        <NavLink href="/media" label="Media" />
        <NavLink href="/usage" label="Usage" />
        <NavLink href="/settings" label="Settings" />
      </nav>

      {/* Main content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatusCard title="Gateway" value="Online" color="emerald" />
            <StatusCard title="Sessions" value="0" color="blue" />
            <StatusCard title="Telegram" value="Pending" color="yellow" />
            <StatusCard title="LLM" value="Pending" color="yellow" />
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <p className="text-zinc-400">
              Welcome to SecureClaudebot Mission Control. Use the sidebar to
              navigate between the chat interface, system status, Kanban board,
              and settings.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
      }`}
    >
      {label}
    </a>
  );
}

function StatusCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-400/20",
    blue: "text-blue-400 border-blue-400/20",
    yellow: "text-yellow-400 border-yellow-400/20",
    red: "text-red-400 border-red-400/20",
  };

  return (
    <div
      className={`bg-zinc-900 rounded-lg border p-4 ${colorMap[color] ?? ""}`}
    >
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{title}</p>
      <p className={`text-xl font-mono font-bold mt-1 ${colorMap[color]?.split(" ")[0]}`}>
        {value}
      </p>
    </div>
  );
}
