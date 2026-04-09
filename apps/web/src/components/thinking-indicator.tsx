"use client";

import { LoaderCircle } from "lucide-react";

type ThinkingTone = "muted" | "foreground" | "light";
type ThinkingSize = "sm" | "md";

export function ThinkingIndicator({
  label = "Thinking...",
  tone = "muted",
  size = "sm",
  className = "",
}: {
  label?: string;
  tone?: ThinkingTone;
  size?: ThinkingSize;
  className?: string;
}) {
  const toneClass =
    tone === "light"
      ? "text-white"
      : tone === "foreground"
        ? "text-foreground"
        : "text-muted";

  const iconClass = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const textClass = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`flex items-center gap-2 ${toneClass} ${className}`.trim()}>
      <LoaderCircle className={`${iconClass} animate-spin`} />
      <span className={`${textClass} font-medium`}>{label}</span>
    </div>
  );
}
