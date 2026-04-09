"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useChat } from "@/lib/chat-context";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import {
  Sparkles,
  TrendingUp,
  Package,
  DollarSign,
  Lightbulb,
  MessageSquare,
  X,
} from "lucide-react";

type InsightCategory =
  | "operations"
  | "inventory"
  | "financial"
  | "recommendations";
type InsightSeverity = "info" | "warning" | "critical";

interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  text: string;
  severity: InsightSeverity;
  action?: string;
}

const CATEGORY_CONFIG: Record<
  InsightCategory,
  { label: string; icon: typeof TrendingUp }
> = {
  operations: { label: "Operations", icon: TrendingUp },
  inventory: { label: "Inventory", icon: Package },
  financial: { label: "Financial", icon: DollarSign },
  recommendations: { label: "Recommendations", icon: Lightbulb },
};

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

export default function InsightsPage() {
  const { token } = useAuth();
  const { openChat } = useChat();
  const [activeTab, setActiveTab] = useState<InsightCategory | "all">("all");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    api<{ data: Insight[] }>("/api/insights", { token })
      .then((res) => setInsights(res.data))
      .finally(() => setLoading(false));
  }, [token]);

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  const filtered = insights
    .filter((i) => !dismissed.has(i.id))
    .filter((i) => activeTab === "all" || i.category === activeTab);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <ThinkingIndicator size="md" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-ai" />
        <h1 className="text-xl font-bold text-foreground">AI Insights</h1>
      </div>

      {/* Category Tabs */}
      <div className="mt-4 flex gap-1 border-b border-border">
        {(
          [
            "all",
            "operations",
            "inventory",
            "financial",
            "recommendations",
          ] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "border-b-2 border-ai text-ai-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab === "all" ? "All" : CATEGORY_CONFIG[tab].label}
          </button>
        ))}
      </div>

      {/* Insight Cards */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No insights available for this category.
          </p>
        )}
        {filtered.map((insight) => {
          const config = CATEGORY_CONFIG[insight.category];
          const Icon = config.icon;
          return (
            <div
              key={insight.id}
              className="rounded border-l-2 border-ai bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-ai-foreground bg-ai-light px-1.5 py-0.5 rounded">
                        {config.label}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_STYLES[insight.severity]}`}
                      >
                        {insight.severity}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {insight.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">{insight.text}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() =>
                          openChat(
                            insight.action ??
                              `Tell me more about: ${insight.title}`,
                          )
                        }
                        className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground hover:text-ai"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Ask more about this
                      </button>
                      <button
                        onClick={() => dismiss(insight.id)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(insight.id)}
                  className="shrink-0 text-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
