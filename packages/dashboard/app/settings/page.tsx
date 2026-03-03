"use client";

import { useState, type FormEvent } from "react";
import { useSocket } from "@/lib/socket";
import { Bot, Lock, Shield, Trash2, Check } from "lucide-react";

interface LlmSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export default function SettingsPage() {
  const { socket, connected } = useSocket();

  // LLM Settings
  const [llm, setLlm] = useState<LlmSettings>({
    provider: "anthropic",
    model: "",
    apiKey: "",
    baseUrl: "",
  });

  // Telegram
  const [telegramToken, setTelegramToken] = useState("");
  const [approvedUsers, setApprovedUsers] = useState("");

  // Security
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Feedback
  const [savedSection, setSavedSection] = useState<string | null>(null);

  const showSaved = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const handleSaveLlm = (e: FormEvent) => {
    e.preventDefault();
    if (!socket || !connected) return;
    socket.emit("settings:update", {
      section: "llm",
      data: {
        primary: {
          provider: llm.provider,
          model: llm.model,
          apiKey: llm.apiKey || undefined,
          baseUrl: llm.baseUrl || undefined,
        },
      },
    });
    showSaved("llm");
  };

  const handleSaveTelegram = (e: FormEvent) => {
    e.preventDefault();
    if (!socket || !connected) return;
    socket.emit("settings:update", {
      section: "telegram",
      data: {
        botToken: telegramToken,
        approvedUsers: approvedUsers
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n)),
      },
    });
    showSaved("telegram");
  };

  const handleChangePin = (e: FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      alert("PINs do not match");
      return;
    }
    if (newPin.length < 4) {
      alert("PIN must be at least 4 characters");
      return;
    }
    if (!socket || !connected) return;
    socket.emit("settings:change-pin", {
      currentPin,
      newPin,
    });
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    showSaved("pin");
  };

  return (
    <div className="p-8 lg:p-12 max-w-3xl mx-auto">
      <header className="mb-12">
        <h1 className="text-3xl font-light tracking-tight mb-2">Settings</h1>
        <p className="text-white/40">Configure your SecureClaudebot</p>
      </header>

      <div className="space-y-6">
        {/* LLM Configuration */}
        <section className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Bot size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-light">LLM Provider</h3>
                <p className="text-xs text-white/40">Configure AI model settings</p>
              </div>
            </div>
            {savedSection === "llm" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
          <form onSubmit={handleSaveLlm} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-2">Provider</label>
                <input
                  type="text"
                  value={llm.provider}
                  onChange={(e) => setLlm({ ...llm, provider: e.target.value })}
                  placeholder="anthropic, openai, google, ollama"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2">Model</label>
                <input
                  type="text"
                  value={llm.model}
                  onChange={(e) => setLlm({ ...llm, model: e.target.value })}
                  placeholder="claude-sonnet-4-20250514, gpt-4o, etc."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            {llm.provider !== "ollama" && llm.provider !== "" && (
              <div>
                <label className="block text-xs text-white/40 mb-2">API Key</label>
                <input
                  type="password"
                  value={llm.apiKey}
                  onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
                <p className="text-[10px] text-white/30 mt-2">Stored encrypted with AES-256-GCM</p>
              </div>
            )}

            {(llm.provider === "openai" || llm.provider === "ollama" || llm.baseUrl) && (
              <div>
                <label className="block text-xs text-white/40 mb-2">
                  Base URL {llm.provider === "ollama" && "(default: localhost:11434)"}
                </label>
                <input
                  type="url"
                  value={llm.baseUrl}
                  onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })}
                  placeholder={llm.provider === "ollama" ? "http://localhost:11434/api" : "https://api.openai.com/v1"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={!connected}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-black text-sm font-medium rounded-xl transition-colors"
            >
              Save LLM Settings
            </button>
          </form>
        </section>

        {/* Telegram Configuration */}
        <section className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Shield size={20} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-light">Telegram Bot</h3>
                <p className="text-xs text-white/40">Bot configuration and access control</p>
              </div>
            </div>
            {savedSection === "telegram" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
          <form onSubmit={handleSaveTelegram} className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-2">Bot Token</label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="123456:ABC-DEF..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-2">Pre-approved User IDs</label>
              <input
                type="text"
                value={approvedUsers}
                onChange={(e) => setApprovedUsers(e.target.value)}
                placeholder="123456789, 987654321"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={!connected}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 text-black text-sm font-medium rounded-xl transition-colors"
            >
              Save Telegram Settings
            </button>
          </form>
        </section>

        {/* PIN Change */}
        <section className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lock size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-light">Encryption PIN</h3>
                <p className="text-xs text-white/40">Secure your stored secrets</p>
              </div>
            </div>
            {savedSection === "pin" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check size={14} /> PIN changed
              </span>
            )}
          </div>
          <p className="text-xs text-white/30 mb-6">
            The PIN is used to derive the encryption key (PBKDF2 + AES-256-GCM) for all stored secrets.
          </p>
          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-2">Current PIN</label>
              <input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/40 mb-2">New PIN</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  minLength={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-2">Confirm PIN</label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  minLength={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!connected || !currentPin || !newPin || !confirmPin}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-white/30 text-black text-sm font-medium rounded-xl transition-colors"
            >
              Change PIN
            </button>
          </form>
        </section>

        {/* Danger Zone */}
        <section className="bg-white/[0.02] border border-red-500/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Trash2 size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-light">Danger Zone</h3>
              <p className="text-xs text-white/40">Irreversible actions</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Clear all sessions</p>
              <p className="text-xs text-white/30">Disconnect all active sessions and clear conversation history</p>
            </div>
            <button
              onClick={() => {
                if (confirm("Are you sure? This will clear all active sessions.")) {
                  socket?.emit("sessions:clear-all");
                }
              }}
              disabled={!connected}
              className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-colors"
            >
              Clear Sessions
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
