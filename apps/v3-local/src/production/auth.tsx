import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { remoteApi } from "./api";
import type { RemoteUser } from "./types";

interface AuthValue {
  user: RemoteUser | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function RemoteAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RemoteUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    remoteApi
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      login: async (username, password) => {
        const result = await remoteApi.login(username, password);
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
    [loading, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useRemoteAuth() {
  const value = useContext(AuthContext);
  if (!value)
    throw new Error("useRemoteAuth must be used inside RemoteAuthProvider");
  return value;
}
