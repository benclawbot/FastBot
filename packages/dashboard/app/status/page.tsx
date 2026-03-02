"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Power, RotateCcw } from "lucide-react";

export default function StatusPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gateway", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" })
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
    setLoading(false);
  };

  const handleAction = async (action: string) => {
    if (!confirm(`Are you sure you want to ${action} the gateway?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      alert(data.message || data.error);
      if (action === "restart") {
        // Wait and refetch
        setTimeout(fetchStatus, 3000);
      }
    } catch (err) {
      alert("Action failed: " + err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Gateway Status</h1>
      
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400">Status</p>
            <p className="text-2xl font-mono">
              {status?.status || "loading..."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-3 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        
        {status?.uptime && (
          <p className="text-gray-400 mt-4">Uptime: {status.uptime}</p>
        )}
        {status?.version && (
          <p className="text-gray-400">Version: {status.version}</p>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Gateway Control</h2>
        <div className="flex gap-4">
          <button
            onClick={() => handleAction("restart")}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
          >
            <RotateCcw className="w-5 h-5" />
            Restart
          </button>
          
          <button
            onClick={() => handleAction("stop")}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Power className="w-5 h-5" />
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
