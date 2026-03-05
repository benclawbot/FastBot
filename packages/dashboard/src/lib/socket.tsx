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

// Discover gateway port dynamically
async function discoverGatewayPort(): Promise<number> {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  const dashboardPort = typeof window !== "undefined" ? window.location.port : "3100";

  // First try the dashboard's API endpoint (works in production too)
  try {
    const res = await fetch(`/api/gateway/port`, {
      method: "GET",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.port) {
        return data.port;
      }
    }
  } catch {
    // Fall through to next method
  }

  // Fallback: try fixed port
  return 44512;
}

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  authenticated: boolean;
  login: (pin: string) => Promise<boolean>;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  authenticated: false,
  login: async () => false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Get stored token
  const getStoredToken = (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("gateway_token");
  };

  // Store token
  const storeToken = (token: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("gateway_token", token);
  };

  // Login function
  const login = async (pin: string): Promise<boolean> => {
    if (!socketRef.current) return false;

    return new Promise((resolve) => {
      // Set a timeout in case the server doesn't respond
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      socketRef.current!.emit("auth:login", { pin }, (response: { token?: string; error?: string }) => {
        clearTimeout(timeout);
        if (response.token) {
          storeToken(response.token);
          setAuthenticated(true);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  };

  useEffect(() => {
    discoverGatewayPort().then((port) => {
      // Use explicit IP to avoid hostname resolution issues
      const url = `http://127.0.0.1:${port}`;
      const token = getStoredToken();

      const s = io(url, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: token ? { token } : undefined,
        forceNew: true,
      });

      s.on("connect", () => {
        console.log("[Socket] Connected to gateway");
        setConnected(true);
        // Auto-login without PIN (JWT secret is configured)
        s.emit("auth:login", {}, (response: { token?: string; error?: string }) => {
          console.log("[Socket] Auto-login response:", response);
          if (response.token) {
            storeToken(response.token);
            setAuthenticated(true);
          }
        });
      });

      s.on("connect_error", (err) => {
        console.error("[Socket] Connection error:", err.message);
      });

      s.on("disconnect", () => {
        console.log("[Socket] Disconnected");
        setConnected(false);
        setAuthenticated(false);
      });

      s.on("auth:error", () => {
        setAuthenticated(false);
        localStorage.removeItem("gateway_token");
      });

      s.on("auth:login", (data) => {
        console.log("[Socket] Auth login response:", data);
        if (data.token) {
          setAuthenticated(true);
        }
      });

      setSocket(s);
      socketRef.current = s;
    });
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected, authenticated, login }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
