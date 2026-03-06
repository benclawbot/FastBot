"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useSocket } from "@/lib/socket";

// Claudegram commands
const COMMANDS = [
  { name: "project", description: "Set project directory", example: "/project /path/to/project" },
  { name: "continue", description: "Resume last session", example: "/continue" },
  { name: "resume", description: "Resume last session", example: "/resume" },
  { name: "plan", description: "Plan mode - describe task for agent to plan", example: "/plan build a todo app" },
  { name: "explore", description: "Explore mode - analyze codebase", example: "/explore how does auth work" },
  { name: "loop", description: "Loop mode - iterate until done", example: "/loop fix all bugs" },
  { name: "clear", description: "Clear conversation", example: "/clear" },
];

interface SessionInfo {
  workingDirectory: string;
  conversationId: string;
}

export default function ChatPage() {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<Array<{ role: string; content: string; ts: number }>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(COMMANDS);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Setup socket
  useEffect(() => {
    if (!socket || !connected) return;

    socket.on("session:joined", (data: { sessionId: string; messages: Array<{ role: string; content: string; ts: number }> }) => {
      setSessionId(data.sessionId);
      setMessages(data.messages);
    });

    socket.on("session:info", (data: SessionInfo) => {
      setSessionInfo(data);
    });

    socket.on("chat:message", (data: { role: string; content: string; ts: number }) => {
      setMessages(prev => [...prev, { role: data.role, content: data.content, ts: data.ts }]);
    });

    socket.on("chat:stream:start", () => {
      setStreaming(true);
      setMessages(prev => [...prev, { role: "assistant", content: "", ts: Date.now() }]);
    });

    socket.on("chat:stream:chunk", (data: { chunk: string }) => {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          last.content += data.chunk;
        }
        return updated;
      });
    });

    socket.on("chat:stream:end", () => {
      setStreaming(false);
    });

    // Request session info
    socket.emit("session:info");

    return () => {
      socket.off("session:joined");
      socket.off("session:info");
      socket.off("chat:message");
      socket.off("chat:stream:start");
      socket.off("chat:stream:chunk");
      socket.off("chat:stream:end");
    };
  }, [socket, connected]);

  // Filter commands
  useEffect(() => {
    if (input.startsWith("/")) {
      const query = input.slice(1).toLowerCase();
      const filtered = COMMANDS.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query)
      );
      setFilteredCommands(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }, [input]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket || !connected) return;

    socket.emit("chat:message", { content: input });
    setInput("");
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        setInput(`/${filteredCommands[selectedIndex].name} `);
        setShowSuggestions(false);
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !showSuggestions) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getProjectName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-light">Chat</h2>
          {sessionInfo?.workingDirectory && (
            <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-1 rounded">
              {getProjectName(sessionInfo.workingDirectory)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-white/40">
            {connected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full space-y-5">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/20">
                <span className="text-black text-2xl font-bold">CG</span>
              </div>
              <h3 className="text-xl font-light text-white/80 mb-3">
                Claudegram
              </h3>
              <p className="text-sm text-white/40 max-w-md mx-auto leading-relaxed">
                Your AI coding assistant. Use /project to set a working directory.
              </p>
              <div className="mt-6 text-xs text-white/30 space-y-1">
                <p>Type <span className="text-white/50">/</span> for commands</p>
                <p>/project /path/to/project - Set working directory</p>
                <p>/plan, /explore, /loop - Agent modes</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={`${msg.ts}-${i}`}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-emerald-500/20">
                <span className="text-black text-xs font-bold">CG</span>
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                  msg.role === "user"
                    ? "bg-white/10 border border-white/10 text-white"
                    : "bg-white/[0.03] border border-white/[0.06] text-white/90"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </div>
                <div className={`text-[10px] mt-2 ${msg.role === "user" ? "text-white/40" : "text-white/30"}`}>
                  {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                  <span className="text-blue-400 text-xs font-bold">U</span>
                </div>
              )}
            </div>
          ))}

          {streaming && (
            <div className="flex items-center gap-3 text-white/40 text-sm py-3">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-xs">Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/5 px-6 py-4 shrink-0 bg-[#0a0a0a]">
        <form onSubmit={handleSubmit} className="w-full relative">
          {showSuggestions && filteredCommands.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-xl z-50"
            >
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.name}
                  type="button"
                  onClick={() => {
                    setInput(`/${cmd.name} `);
                    setShowSuggestions(false);
                    inputRef.current?.focus();
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    index === selectedIndex
                      ? "bg-emerald-500/10 border-l-2 border-emerald-400"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">/{cmd.name}</span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{cmd.description}</p>
                    <p className="text-xs text-white/20 mt-1 font-mono">{cmd.example}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connected
                ? "Type a message... (Enter to send, / for commands)"
                : "Connecting to gateway..."
            }
            disabled={!connected || streaming}
            rows={1}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-24 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
            style={{ minHeight: "52px", maxHeight: "200px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
            }}
          />
          <button
            type="submit"
            disabled={!connected || !input.trim() || streaming}
            className="absolute right-2 bottom-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-black text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
