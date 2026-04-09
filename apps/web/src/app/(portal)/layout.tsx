"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AuthProvider } from "@/lib/auth";
import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/sidebar";
import { AIChatPanel } from "@/components/ai-chat-panel";
import { ChatContext, type OpenChatOptions } from "@/lib/chat-context";
import type { AssistantShellMode } from "@/components/assistant-workspace";

const ASSISTANT_OPEN_KEY = "evo_assistant_open";
const ASSISTANT_SHELL_KEY = "evo_assistant_shell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [chatOpen, setChatOpen] = useState(true);
  const [chatPrompt, setChatPrompt] = useState<string | undefined>();
  const [chatShellMode, setChatShellMode] =
    useState<AssistantShellMode>("workspace");

  useEffect(() => {
    const storedOpen = localStorage.getItem(ASSISTANT_OPEN_KEY);
    const storedShell = localStorage.getItem(ASSISTANT_SHELL_KEY);

    if (storedOpen !== null) {
      setChatOpen(storedOpen === "true");
    }
    if (
      storedShell === "docked" ||
      storedShell === "workspace" ||
      storedShell === "fullscreen"
    ) {
      setChatShellMode(storedShell);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_OPEN_KEY, String(chatOpen));
  }, [chatOpen]);

  useEffect(() => {
    localStorage.setItem(ASSISTANT_SHELL_KEY, chatShellMode);
  }, [chatShellMode]);

  const openChat = useCallback((prompt?: string, options?: OpenChatOptions) => {
    setChatPrompt(prompt);
    setChatOpen(true);
    if (options?.shellMode) {
      setChatShellMode(options.shellMode);
    }
  }, []);

  const handleClose = useCallback(() => {
    setChatOpen(false);
    setChatPrompt(undefined);
  }, []);

  return (
    <AuthProvider>
      <AuthGuard>
        <ChatContext.Provider value={{ openChat }}>
          <div className="flex h-screen bg-background">
            <Sidebar />
            <div className="flex min-w-0 flex-1 overflow-hidden">
              <main className="min-w-0 flex-1 overflow-y-auto p-6">
                {children}
              </main>
              <AIChatPanel
                open={chatOpen}
                onClose={handleClose}
                initialPrompt={chatPrompt}
                shellMode={chatShellMode}
                onShellModeChange={setChatShellMode}
              />
            </div>

            {!chatOpen && (
              <button
                type="button"
                onClick={() =>
                  openChat(undefined, { shellMode: chatShellMode })
                }
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-ai px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-ai-hover"
              >
                <Sparkles className="h-4 w-4" />
                Open Assistant
              </button>
            )}
          </div>
        </ChatContext.Provider>
      </AuthGuard>
    </AuthProvider>
  );
}
