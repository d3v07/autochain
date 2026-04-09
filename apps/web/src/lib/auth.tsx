"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { LoginResponse, MeResponse } from "@autochain/shared";

interface AuthState {
  token: string | null;
  user: LoginResponse["user"] | null;
  session: LoginResponse["session"] | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<LoginResponse["user"]>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "evo_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    session: null,
    loading: true,
  });

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setState({ token: null, user: null, session: null, loading: false });
      return;
    }

    api<{ success: boolean; data: MeResponse }>("/api/auth/me", {
      token: stored,
    })
      .then((res) => {
        setState({
          token: stored,
          user: res.data.user,
          session: res.data.session,
          loading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ token: null, user: null, session: null, loading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ success: boolean; data: LoginResponse }>(
      "/api/auth/login",
      {
        method: "POST",
        body: { email, password },
      },
    );
    const { token, user, session } = res.data;
    localStorage.setItem(TOKEN_KEY, token);
    setState({ token, user, session, loading: false });
    return user;
  }, []);

  const logout = useCallback(() => {
    if (state.token) {
      void api<{ success: boolean; data: { revoked: boolean } }>(
        "/api/auth/logout",
        {
          method: "POST",
          token: state.token,
        },
      ).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, user: null, session: null, loading: false });
  }, [state.token]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
