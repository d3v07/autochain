"use client";

import { createContext, useContext } from "react";
import type { AssistantShellMode } from "@/components/assistant-workspace";

export interface OpenChatOptions {
  shellMode?: AssistantShellMode;
}

interface ChatContextValue {
  openChat: (prompt?: string, options?: OpenChatOptions) => void;
}

export const ChatContext = createContext<ChatContextValue>({
  openChat: () => {},
});

export function useChat() {
  return useContext(ChatContext);
}
