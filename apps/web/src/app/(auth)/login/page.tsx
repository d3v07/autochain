"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ThinkingIndicator } from "@/components/thinking-indicator";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loggedInUser = await login(email, password);
      router.push(
        loggedInUser.role === "admin"
          ? "/admin/dashboard"
          : loggedInUser.role === "vendor"
            ? "/vendor/dashboard"
            : "/dashboard",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-accent">
            eSupplyPro
          </h1>
          <p className="mt-1 text-sm text-muted">AutoChain Customer Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-border bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none disabled:opacity-50"
          >
            {loading ? (
              <ThinkingIndicator tone="light" className="justify-center" />
            ) : (
              "Sign in"
            )}
          </button>

          <p className="text-center text-xs text-muted">
            Demo: orders@acmewindows.com / demo1234, ops@northstarextrusions.com
            / demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
