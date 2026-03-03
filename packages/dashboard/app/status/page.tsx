"use client";

import { useStatus } from "@/lib/hooks";
import { useSocket } from "@/lib/socket";
import { useEffect, useState } from "react";
import { Activity, Clock, Users, HardDrive, Shield } from "lucide-react";

interface AuditEntry {
  id: number;
  event: string;
  actor: string;
  detail: string;
  ts: number;
}

export default function StatusPage() {
  const { status, connected } = useStatus(3000);
  const { socket } = useSocket();
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit("audit:request", { limit: 50 });
    socket.on("audit:entries", (entries: AuditEntry[]) => {
      setAuditLog(entries);
    });

    return () => {
      socket.off("audit:entries");
    };
  }, [socket, connected]);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const stats = [
    { label: "Status", value: connected ? "Online" : "Offline", icon: Activity, color: connected ? "#34d399" : "#f87171" },
    { label: "Uptime", value: status ? formatUptime(status.uptime) : "--", icon: Clock, color: "#a78bfa" },
    { label: "Sessions", value: String(status?.sessions ?? "--"), icon: Users, color: "#60a5fa" },
    { label: "Memory", value: status ? `${status.memoryMB} MB` : "--", icon: HardDrive, color: "#fbbf24" },
  ];

  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="text-3xl font-light tracking-tight mb-2">System Status</h1>
        <p className="text-white/40">Health checks and security events</p>
      </header>

      {!connected && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-8 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-red-300 text-sm">Gateway disconnected. Attempting to reconnect...</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
              <Icon size={16} style={{ color: color + '60' }} />
            </div>
            <p className="text-2xl font-light">{value}</p>
          </div>
        ))}
      </div>

      {/* Subsystems */}
      <section className="mb-12">
        <h2 className="text-sm text-white/40 uppercase tracking-wider mb-4">Subsystems</h2>
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl overflow-hidden">
          {status?.subsystems ? (
            Object.entries(status.subsystems).map(([name, state], i, arr) => (
              <div
                key={name}
                className={`flex items-center justify-between px-5 py-4 ${i !== arr.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      state === "online" || state === "connected"
                        ? "bg-emerald-400 shadow-lg shadow-emerald-400/50"
                        : state === "pending"
                          ? "bg-amber-400"
                          : "bg-white/20"
                    }`}
                  />
                  <span className="text-sm text-white/70 capitalize">{name}</span>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${
                  state === "online" || state === "connected"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : state === "pending"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-white/5 text-white/40"
                }`}>
                  {state}
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-white/40 text-sm">
              Waiting for status data...
            </div>
          )}
        </div>
      </section>

      {/* Audit Log */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-white/40" />
          <h2 className="text-sm text-white/40 uppercase tracking-wider">Security Audit Log</h2>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl overflow-hidden">
          {auditLog.length > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              {auditLog.map((entry) => {
                const time = new Date(entry.ts).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const isSecurity = entry.event.startsWith("security.");
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-4 px-5 py-3 text-xs font-mono border-b border-white/[0.02] last:border-0 ${isSecurity ? 'bg-red-500/5' : ''}`}
                  >
                    <span className="text-white/30 shrink-0 w-28">{time}</span>
                    <span className={`shrink-0 w-44 ${isSecurity ? 'text-red-400' : 'text-white/50'}`}>
                      {entry.event}
                    </span>
                    <span className="text-white/40 shrink-0 w-24 truncate">{entry.actor}</span>
                    <span className="text-white/50 truncate">{entry.detail}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-white/40 text-sm">
              {connected ? "No recent audit events" : "Connect to gateway to view audit log"}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
