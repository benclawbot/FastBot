"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSocket } from "./socket";

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  login: (pin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  loading: true,
  login: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { socket, connected, authenticated: socketAuthenticated, login } = useSocket();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for socket to be ready
    if (connected) {
      // Give time for auth state to be determined
      const timer = setTimeout(() => {
        setLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [connected]);

  return (
    <AuthContext.Provider value={{ authenticated: socketAuthenticated, loading, login }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
