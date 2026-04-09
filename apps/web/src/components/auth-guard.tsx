"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ThinkingIndicator } from "@/components/thinking-indicator";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  if (!token) return null;

  return <>{children}</>;
}
