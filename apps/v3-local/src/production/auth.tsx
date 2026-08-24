import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isUnauthenticatedError, remoteApi } from "./api";
import type { RemoteUser } from "./types";

interface AuthValue {
  user: RemoteUser | null;
  loading: boolean;
  error: string;
  retry(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function RemoteAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RemoteUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const verify = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await remoteApi.me();
      setUser(result.user);
    } catch (reason) {
      if (isUnauthenticatedError(reason)) {
        setUser(null);
      } else {
        setError(reason instanceof Error ? reason.message : "无法连接童迹服务");
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void verify();
  }, [verify]);
  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      error,
      retry: verify,
      login: async (username, password) => {
        const result = await remoteApi.login(username, password);
        setError("");
        setUser(result.user);
      },
      logout: async () => {
        try {
          await remoteApi.logout();
        } finally {
          setUser(null);
        }
      },
    }),
    [error, loading, user, verify],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useRemoteAuth() {
  const value = useContext(AuthContext);
  if (!value)
    throw new Error("useRemoteAuth must be used inside RemoteAuthProvider");
  return value;
}
