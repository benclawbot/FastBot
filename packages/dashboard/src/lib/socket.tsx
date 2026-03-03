"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

/**
 * Discover the gateway port by:
 * 1. Checking localStorage for cached port
 * 2. Calling /gateway-info endpoint on the dashboard server
 * 3. Falling back to probing common high ports (30000-65535)
 */
async function discoverGatewayPort(): Promise<number> {
  if (typeof window === "undefined") return 30000;

  // Check localStorage cache first
  const cached = localStorage.getItem("scb_gateway_port");
  if (cached) {
    try {
      return parseInt(cached, 10);
    } catch {
      // Invalid cache, ignore
    }
  }

  // Try to query the gateway info endpoint via dashboard server
  try {
    const response = await fetch("/api/gateway-info", {
      method: "GET",
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as { port: number };
      localStorage.setItem("scb_gateway_port", String(data.port));
      return data.port;
    }
  } catch {
    // Endpoint not available, fall through to probing
  }

  // Fallback: try common ports in range 30000-65535
  const portsToTry = [
    30000, 31337, 40000, 45000, 50000, 55000, 60000, 65535,
  ];

  for (const port of portsToTry) {
    try {
      const response = await fetch(
        `http://${window.location.hostname}:${port}/health`,
        { method: "GET", timeout: 1000 }
      );
      if (response.ok) {
        localStorage.setItem("scb_gateway_port", String(port));
        return port;
      }
    } catch {
      // Port not responding, try next
    }
  }

  // If all else fails, default to 30000
  return 30000;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [gatewayPort, setGatewayPort] = useState<number | null>(null);

  useEffect(() => {
    discoverGatewayPort().then((port) => {
      setGatewayPort(port);

      const hostname =
        typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
      const gatewayUrl = `http://${hostname}:${port}`;

      const s = io(gatewayUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      socketRef.current = s;

      s.on("connect", () => setConnected(true));
      s.on("disconnect", () => setConnected(false));

      return () => {
        s.close();
      };
    });
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
