"use client";

import {
  AssistantWorkspace,
  type AssistantShellMode,
} from "@/components/assistant-workspace";

export function AIChatPanel({
  open,
  onClose,
  initialPrompt,
  shellMode = "workspace",
  onShellModeChange = () => {},
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  shellMode?: AssistantShellMode;
  onShellModeChange?: (mode: AssistantShellMode) => void;
}) {
  return (
    <AssistantWorkspace
      open={open}
      onClose={onClose}
      initialPrompt={initialPrompt}
      shellMode={shellMode}
      onShellModeChange={onShellModeChange}
    />
  );
}
