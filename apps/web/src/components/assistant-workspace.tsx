"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowBigRightDash,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  FileAudio,
  FileText,
  FolderKanban,
  Maximize2,
  Mic,
  Minimize2,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  Send,
  Sparkles,
  Volume2,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  AssistantEntry,
  AiStateResponse,
  AssistantSession,
  AssistantWorkspaceOverview,
  WorkflowRun,
  WorkflowStep,
} from "@autochain/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

export type AssistantShellMode = "docked" | "workspace" | "fullscreen";

type ActivePlan = WorkflowRun & {
  requiresApproval?: boolean;
  timeoutSeconds?: number;
  executionState?: string;
};

type TextMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type WorkspacePayload = AiStateResponse & {
  overview: AssistantWorkspaceOverview;
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
          length: number;
        }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => VoiceRecognition;
    webkitSpeechRecognition?: new () => VoiceRecognition;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const STANDARD_SUGGESTED_PROMPTS = [
  "What's my best-selling product this quarter?",
  "Show orders pending shipment",
  "Which invoices are overdue?",
  "Find low-stock items",
  "Recommend reorder quantities",
];

const VENDOR_STANDARD_SUGGESTED_PROMPTS = [
  "Summarize open purchase orders",
  "Which vendor invoices need payment follow-up?",
  "Show constrained catalog items",
  "What shipments are still in transit?",
  "Which lead times are at risk?",
];

const CUSTOMER_AGENTIC_PROMPTS = [
  "Check unpaid invoices",
  "Generate a monthly summary",
  "Review low-stock products and suggest reorders",
  "Draft a customer agreement",
];

const ADMIN_AGENTIC_PROMPTS = [
  "Review risky sessions and summarize findings",
  "Generate a top customer risk report",
  "Prepare an operator follow-up email draft",
  "Build a weekly operations summary",
];

const VENDOR_AGENTIC_PROMPTS = [
  "Review constrained catalog and summarize next actions",
  "Check vendor invoices and prepare a finance brief",
  "Summarize open purchase orders and shipments",
  "Draft a supplier agreement addendum",
];

const VOICE_SUGGESTED_PROMPTS = [
  "Give me a 30 second summary of overdue invoices",
  "Read out the top low-stock products",
  "Brief me on this month's order activity",
];

const VISUAL_SUGGESTED_PROMPTS = [
  "Invoice aging dashboard",
  "Inventory attention list",
  "Monthly account activity snapshot",
];

const MODE_ITEMS = [
  {
    value: "text",
    label: "Text",
    icon: Sparkles,
    helper: "Typed assistant and editable summaries",
  },
  {
    value: "voice",
    label: "Voice",
    icon: Mic,
    helper: "Live transcript, briefing, and spoken reply",
  },
  {
    value: "video",
    label: "Visual",
    icon: MonitorPlay,
    helper: "Screenshot and dashboard-guided review",
  },
  {
    value: "agentic",
    label: "Agentic",
    icon: Bot,
    helper: "Plan, approve, and execute in-app workflows",
  },
] as const;

const AUTONOMY_ITEMS = [
  { value: "manual", label: "Manual", helper: "Conversation only" },
  { value: "ask", label: "Ask", helper: "Preview before execution" },
  { value: "agent", label: "Agent", helper: "Auto-run safe read steps" },
] as const;

const QUICK_DOCUMENT_ACTIONS = {
  customer: [
    {
      kind: "report",
      title: "Monthly Summary",
      prompt:
        "Create a monthly customer summary with orders, invoices, and next actions.",
    },
    {
      kind: "invoice",
      title: "Unpaid Invoice Review",
      prompt: "Create a finance review focused on unpaid and overdue invoices.",
    },
    {
      kind: "agreement",
      title: "Agreement Draft",
      prompt: "Draft an agreement from the current assistant context.",
    },
  ],
  admin: [
    {
      kind: "report",
      title: "Weekly Ops Brief",
      prompt:
        "Create an operational brief covering platform health, sessions, and customer risk.",
    },
    {
      kind: "report",
      title: "Customer Risk Report",
      prompt: "Create a top customer risk report with recommended actions.",
    },
    {
      kind: "agreement",
      title: "Agreement Draft",
      prompt: "Draft an agreement from the current admin assistant context.",
    },
  ],
  vendor: [
    {
      kind: "report",
      title: "Vendor Ops Brief",
      prompt:
        "Create a vendor operations summary covering purchase orders, shipments, invoice status, and supply constraints.",
    },
    {
      kind: "report",
      title: "Catalog Constraint Review",
      prompt:
        "Create a catalog availability report focused on constrained items, lead times, and recommended follow-up actions.",
    },
    {
      kind: "agreement",
      title: "Supplier Agreement Draft",
      prompt:
        "Draft a supplier agreement or addendum from the current vendor assistant context.",
    },
  ],
} as const;

const ACTION_TYPE_META: Record<
  WorkflowStep["actionType"],
  { icon: LucideIcon; label: string; classes: string }
> = {
  navigate: {
    icon: ArrowBigRightDash,
    label: "Navigate",
    classes: "border-slate-200 bg-slate-100 text-slate-700",
  },
  query: {
    icon: Sparkles,
    label: "Query",
    classes: "border-blue-100 bg-blue-50 text-blue-700",
  },
  generate: {
    icon: FileText,
    label: "Generate",
    classes: "border-emerald-100 bg-emerald-50 text-emerald-700",
  },
  mutate: {
    icon: Workflow,
    label: "Mutate",
    classes: "border-amber-100 bg-amber-50 text-amber-700",
  },
  connector: {
    icon: Activity,
    label: "Connector",
    classes: "border-rose-100 bg-rose-50 text-rose-700",
  },
};

function sessionEntriesToMessages(session: AssistantSession | null) {
  if (!session?.entries) return [] as TextMessage[];

  return session.entries
    .filter(
      (
        entry,
      ): entry is AssistantEntry & {
        role: "user" | "assistant";
      } =>
        (entry.entryType === "message" ||
          entry.entryType === "summary" ||
          entry.entryType === "speech" ||
          entry.entryType === "transcript") &&
        (entry.role === "user" || entry.role === "assistant"),
    )
    .map((entry) => ({
      id: `${entry.id}`,
      role: entry.role,
      content: entry.content,
      timestamp: new Date(entry.createdAt),
    }));
}

function placeholderForMode(mode: AiStateResponse["mode"] | undefined) {
  switch (mode) {
    case "voice":
      return "Ask for a spoken summary or briefing...";
    case "video":
      return "Describe the dashboard or screenshot context...";
    case "agentic":
      return "Describe the task you want planned inside eSupplyPro...";
    case "text":
    default:
      return "Ask about orders, products, invoices, or reports...";
  }
}

function roleLabel(role: AiStateResponse["role"] | undefined) {
  switch (role) {
    case "admin":
      return "Admin";
    case "vendor":
      return "Vendor";
    case "customer":
    default:
      return "Client";
  }
}

function nextPlanActionCopy(plan: ActivePlan | null) {
  if (!plan) return "";
  if (plan.status === "planned") {
    return "Plan is ready. Review the steps, then start execution inside the app sandbox.";
  }
  if (plan.status === "waiting_approval") {
    return "Plan review is complete. The next step needs approval before execution continues.";
  }
  if (plan.status === "failed") {
    return "Inspect the failed step, then retry or cancel the workflow.";
  }
  if (plan.status === "completed") {
    return "Workflow completed. Review the artifacts or create the next plan.";
  }
  if (plan.status === "cancelled") {
    return "Workflow cancelled. No further steps will run.";
  }
  return "Continue the workflow from the next approved step.";
}

function getPrimaryPlanAction(plan: ActivePlan | null) {
  if (!plan) return null;
  if (plan.status === "planned") {
    return { label: "Start Plan", intent: "run" as const };
  }
  if (plan.status === "waiting_approval") {
    return { label: "Approve Next Step", intent: "approve" as const };
  }
  if (plan.status === "running") {
    return { label: "Continue Plan", intent: "run" as const };
  }
  return null;
}

function modeLabel(mode: AiStateResponse["mode"] | undefined) {
  return mode === "video" ? "visual" : (mode ?? "text");
}

function getShellClasses(shellMode: AssistantShellMode) {
  if (shellMode === "fullscreen") {
    return "fixed inset-4 z-50 rounded-2xl border border-border bg-surface shadow-2xl";
  }
  if (shellMode === "workspace") {
    return "w-[760px] min-w-[760px] border-l border-border bg-surface shadow-lg";
  }
  return "w-[520px] min-w-[520px] border-l border-border bg-surface shadow-lg";
}

export function AssistantWorkspace({
  open,
  onClose,
  initialPrompt,
  shellMode,
  onShellModeChange,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  shellMode: AssistantShellMode;
  onShellModeChange: (mode: AssistantShellMode) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();
  const [aiState, setAiState] = useState<AiStateResponse | null>(null);
  const [workspace, setWorkspace] = useState<AssistantWorkspaceOverview | null>(
    null,
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [aiStateLoading, setAiStateLoading] = useState(false);
  const [aiStateSaving, setAiStateSaving] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [aiStateError, setAiStateError] = useState("");
  const [activeSession, setActiveSession] = useState<AssistantSession | null>(
    null,
  );
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [visualTitle, setVisualTitle] = useState("");
  const [visualDescription, setVisualDescription] = useState("");
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualPreview, setVisualPreview] = useState<{
    name: string;
    type: string;
    size: number;
    previewUrl?: string;
  } | null>(null);
  const [agenticTask, setAgenticTask] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const transcriptRef = useRef("");
  const initialPromptHandledRef = useRef<string | null>(null);

  const agenticUnlocked = aiState ? aiState.autonomy !== "manual" : false;
  const quickDocumentActions =
    aiState?.role === "admin"
      ? QUICK_DOCUMENT_ACTIONS.admin
      : aiState?.role === "vendor"
        ? QUICK_DOCUMENT_ACTIONS.vendor
        : QUICK_DOCUMENT_ACTIONS.customer;

  const suggestedPrompts = useMemo(() => {
    if (aiState?.mode === "agentic") {
      return aiState.role === "admin"
        ? ADMIN_AGENTIC_PROMPTS
        : aiState.role === "vendor"
          ? VENDOR_AGENTIC_PROMPTS
          : CUSTOMER_AGENTIC_PROMPTS;
    }
    if (aiState?.mode === "voice") {
      return aiState.role === "vendor"
        ? [
            "Give me a short shipment briefing",
            "Summarize vendor invoices that need action",
            "Read out constrained catalog items",
          ]
        : VOICE_SUGGESTED_PROMPTS;
    }
    if (aiState?.mode === "video") {
      return aiState.role === "vendor"
        ? [
            "Purchase order dashboard",
            "Catalog constraint review",
            "Vendor invoice aging summary",
          ]
        : VISUAL_SUGGESTED_PROMPTS;
    }
    return aiState?.role === "vendor"
      ? VENDOR_STANDARD_SUGGESTED_PROMPTS
      : STANDARD_SUGGESTED_PROMPTS;
  }, [aiState?.mode, aiState?.role]);

  const activePlanCounts = useMemo(() => {
    if (!activePlan) {
      return { total: 0, completed: 0, approvals: 0 };
    }
    return {
      total: activePlan.steps.length,
      completed: activePlan.steps.filter(
        (step) => step.status === "completed" || step.status === "skipped",
      ).length,
      approvals: activePlan.steps.filter((step) => step.requiresApproval)
        .length,
    };
  }, [activePlan]);

  const primaryPlanAction = useMemo(
    () => getPrimaryPlanAction(activePlan),
    [activePlan],
  );

  const sessionByMode = useMemo(() => {
    const grouped = new Map<AiStateResponse["mode"], AssistantSession>();
    for (const session of workspace?.sessions ?? []) {
      if (!grouped.has(session.mode)) {
        grouped.set(session.mode, session);
      }
    }
    return grouped;
  }, [workspace]);

  const voiceEntries = useMemo(
    () =>
      (activeSession?.entries ?? []).filter(
        (entry) =>
          entry.entryType === "transcript" || entry.entryType === "speech",
      ),
    [activeSession],
  );

  const visualEntries = useMemo(
    () =>
      (activeSession?.entries ?? []).filter(
        (entry) =>
          entry.entryType === "visual" || entry.entryType === "summary",
      ),
    [activeSession],
  );

  const agenticEntries = useMemo(
    () =>
      (activeSession?.entries ?? []).filter(
        (entry) => entry.entryType === "plan" || entry.entryType === "event",
      ),
    [activeSession],
  );

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const loadPlan = useCallback(
    async (planId: number) => {
      if (!token) return;
      try {
        const res = await api<{ success: boolean; data: ActivePlan }>(
          `/api/ai/agentic/plans/${planId}`,
          { token },
        );
        setActivePlan(res.data);
      } catch (err) {
        setAiStateError(
          err instanceof Error ? err.message : "Failed to load workflow plan",
        );
      }
    },
    [token],
  );

  const loadSession = useCallback(
    async (sessionId: number) => {
      if (!token) return null;
      setLoadingSession(true);
      try {
        const res = await api<{ success: boolean; data: AssistantSession }>(
          `/api/ai/sessions/${sessionId}`,
          { token },
        );
        setActiveSession(res.data);
        if (res.data.mode === "text") {
          setMessages(sessionEntriesToMessages(res.data));
        }
        if (res.data.linkedWorkflowRunId) {
          void loadPlan(res.data.linkedWorkflowRunId);
        } else if (res.data.mode !== "agentic") {
          setActivePlan(null);
        }
        return res.data;
      } catch (err) {
        setAiStateError(
          err instanceof Error
            ? err.message
            : "Failed to load assistant session",
        );
        return null;
      } finally {
        setLoadingSession(false);
      }
    },
    [loadPlan, token],
  );

  const loadWorkspace = useCallback(async () => {
    if (!token) return;
    setWorkspaceLoading(true);
    setAiStateError("");
    try {
      const res = await api<{ success: boolean; data: WorkspacePayload }>(
        "/api/ai/workspace",
        { token },
      );
      setAiState({
        role: res.data.role,
        mode: res.data.mode,
        autonomy: res.data.autonomy,
        availableModes: res.data.availableModes,
        availableAutonomy: res.data.availableAutonomy,
        featureFlags: res.data.featureFlags,
      });
      setWorkspace(res.data.overview);
    } catch (err) {
      setAiStateError(
        err instanceof Error
          ? err.message
          : "Failed to load assistant workspace",
      );
    } finally {
      setWorkspaceLoading(false);
    }
  }, [token]);

  const createSession = useCallback(
    async (mode: AiStateResponse["mode"], title?: string) => {
      if (!token) return null;
      setSavingSession(true);
      try {
        const res = await api<{ success: boolean; data: AssistantSession }>(
          "/api/ai/sessions",
          {
            method: "POST",
            token,
            body: {
              mode,
              title,
              sourcePage: pathname,
            },
          },
        );
        await loadWorkspace();
        setActiveSession(res.data);
        if (mode === "text") {
          setMessages(sessionEntriesToMessages(res.data));
        }
        return res.data;
      } catch (err) {
        setAiStateError(
          err instanceof Error
            ? err.message
            : "Failed to create assistant session",
        );
        return null;
      } finally {
        setSavingSession(false);
      }
    },
    [loadWorkspace, pathname, token],
  );

  const ensureSession = useCallback(
    async (mode: AiStateResponse["mode"]) => {
      if (activeSession?.mode === mode) {
        return activeSession;
      }

      const existing = sessionByMode.get(mode);
      if (existing) {
        return loadSession(existing.id);
      }

      return createSession(mode);
    },
    [activeSession, createSession, loadSession, sessionByMode],
  );

  const updateAiState = useCallback(
    async (patch: Partial<Pick<AiStateResponse, "mode" | "autonomy">>) => {
      if (!token || aiStateSaving) return null;
      setAiStateSaving(true);
      setAiStateError("");
      try {
        const res = await api<{ success: boolean; data: AiStateResponse }>(
          "/api/ai/state",
          {
            method: "PATCH",
            token,
            body: patch,
          },
        );
        setAiState(res.data);
        return res.data;
      } catch (err) {
        setAiStateError(
          err instanceof Error
            ? err.message
            : "Failed to update assistant state",
        );
        return null;
      } finally {
        setAiStateSaving(false);
      }
    },
    [aiStateSaving, token],
  );

  const handleAutonomyChange = useCallback(
    async (nextAutonomy: AiStateResponse["autonomy"]) => {
      const res = await updateAiState({ autonomy: nextAutonomy });
      if (res?.mode) {
        void ensureSession(res.mode);
      }
    },
    [ensureSession, updateAiState],
  );

  const handleModeChange = useCallback(
    async (nextMode: AiStateResponse["mode"]) => {
      if (nextMode === "agentic" && aiState?.autonomy === "manual") {
        setAiStateError(
          "Select Ask or Agent autonomy before enabling Agentic mode.",
        );
        return;
      }
      const res = await updateAiState({ mode: nextMode });
      if (res?.mode) {
        const session = await ensureSession(res.mode);
        if (session?.mode === "agentic" && session.linkedWorkflowRunId) {
          void loadPlan(session.linkedWorkflowRunId);
        }
      }
    },
    [aiState?.autonomy, ensureSession, loadPlan, updateAiState],
  );

  const sendTextMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !token || loading) return;

      const session = (await ensureSession("text")) ?? activeSession;
      if (!session) return;

      const trimmed = text.trim();
      const userMsg: TextMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      const assistantMsg: TextMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setLoading(true);
      setStreamingMessageId(assistantMsg.id);

      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: trimmed,
            history,
            sessionId: session.id,
          }),
        });

        if (!res.ok || !res.body) {
          const err = await res
            .json()
            .catch(() => ({ error: "AI service unavailable" }));
          throw new Error(err.error ?? "AI service unavailable");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        let finalContent = "";

        while (!done) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          let boundaryIndex = buffer.indexOf("\n\n");

          while (boundaryIndex !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            const data = rawEvent
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n")
              .trim();

            if (!data) {
              boundaryIndex = buffer.indexOf("\n\n");
              continue;
            }

            if (data === "[DONE]") {
              done = true;
              break;
            }

            const payload = JSON.parse(data) as {
              token?: string;
              error?: string;
            };
            if (payload.error) {
              throw new Error(payload.error);
            }
            if (payload.token) {
              finalContent += payload.token;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsg.id
                    ? { ...msg, content: `${msg.content}${payload.token}` }
                    : msg,
                ),
              );
            }

            boundaryIndex = buffer.indexOf("\n\n");
          }
        }

        await loadWorkspace();
        void loadSession(session.id);
      } catch (err) {
        const errorText =
          err instanceof Error
            ? err.message
            : "Sorry, I couldn't process that request.";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsg.id
              ? { ...msg, content: msg.content || errorText }
              : msg,
          ),
        );
        void loadSession(session.id);
      } finally {
        setLoading(false);
        setStreamingMessageId(null);
      }
    },
    [
      activeSession,
      ensureSession,
      loadSession,
      loadWorkspace,
      loading,
      messages,
      token,
    ],
  );

  const createPlanFromTask = useCallback(
    async (taskText?: string) => {
      if (!token || planning) return;
      const session = (await ensureSession("agentic")) ?? activeSession;
      if (!session) return;
      const task = (taskText ?? agenticTask).trim();
      if (!task) return;

      setPlanning(true);
      setAiStateError("");
      try {
        const res = await api<{ success: boolean; data: ActivePlan }>(
          `/api/ai/sessions/${session.id}/create-workflow`,
          {
            method: "POST",
            token,
            body: { task },
          },
        );
        setActivePlan(res.data);
        setAgenticTask("");
        await loadWorkspace();
        void loadSession(session.id);
      } catch (err) {
        setAiStateError(
          err instanceof Error ? err.message : "Failed to create workflow plan",
        );
      } finally {
        setPlanning(false);
      }
    },
    [
      activeSession,
      agenticTask,
      ensureSession,
      loadSession,
      loadWorkspace,
      planning,
      token,
    ],
  );

  const updatePlanStatus = useCallback(
    async (action: "approve" | "cancel" | "retry") => {
      if (!token || !activePlan || planning) return;
      setPlanning(true);
      try {
        const res = await api<{ success: boolean; data: ActivePlan }>(
          `/api/ai/agentic/plans/${activePlan.id}/${action}`,
          {
            method: "POST",
            token,
          },
        );
        setActivePlan(res.data);
        if (activeSession) {
          void loadSession(activeSession.id);
        }
        await loadWorkspace();
      } catch (err) {
        setAiStateError(
          err instanceof Error ? err.message : `Failed to ${action} plan`,
        );
      } finally {
        setPlanning(false);
      }
    },
    [activePlan, activeSession, loadSession, loadWorkspace, planning, token],
  );

  const runPlanStep = useCallback(async () => {
    if (!token || !activePlan || planning) return;
    setPlanning(true);
    try {
      const res = await api<{
        success: boolean;
        data: ActivePlan | null;
        clientAction?: {
          type: "navigate";
          href: string;
          dataAgentId: string;
        } | null;
        notice?: string | null;
        error?: string | null;
      }>(`/api/ai/agentic/plans/${activePlan.id}/run-next`, {
        method: "POST",
        token,
      });

      if (res.data) {
        setActivePlan(res.data);
      }
      if (res.clientAction?.href) {
        router.push(res.clientAction.href);
      }
      if (res.notice) {
        setAiStateError(res.notice);
      } else if (res.error) {
        setAiStateError(res.error);
      } else {
        setAiStateError("");
      }
      await loadWorkspace();
      if (activeSession) {
        void loadSession(activeSession.id);
      }
    } catch (err) {
      setAiStateError(
        err instanceof Error ? err.message : "Failed to run workflow step",
      );
    } finally {
      setPlanning(false);
    }
  }, [
    activePlan,
    activeSession,
    loadSession,
    loadWorkspace,
    planning,
    router,
    token,
  ]);

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const submitVoiceTranscript = useCallback(
    async (transcript: string) => {
      if (!token || !transcript.trim()) return;
      const session = (await ensureSession("voice")) ?? activeSession;
      if (!session) return;

      setVoiceBusy(true);
      setVoiceError("");
      try {
        const res = await api<{
          success: boolean;
          data: {
            session: AssistantSession;
            reply: string;
            shouldSpeak: boolean;
          };
        }>(`/api/ai/sessions/${session.id}/voice-turn`, {
          method: "POST",
          token,
          body: {
            transcript,
            shouldSpeak: true,
          },
        });
        setActiveSession(res.data.session);
        await loadWorkspace();
        if (res.data.shouldSpeak) {
          speakText(res.data.reply);
        }
      } catch (err) {
        setVoiceError(
          err instanceof Error ? err.message : "Failed to process voice turn",
        );
      } finally {
        setVoiceBusy(false);
        setLiveTranscript("");
        transcriptRef.current = "";
      }
    },
    [activeSession, ensureSession, loadWorkspace, speakText, token],
  );

  const startListening = useCallback(async () => {
    if (typeof window === "undefined") return;
    const RecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setVoiceError(
        "Live speech recognition is not supported in this browser.",
      );
      return;
    }

    const session = (await ensureSession("voice")) ?? activeSession;
    if (!session) return;

    transcriptRef.current = "";
    setVoiceError("");
    setVoiceListening(true);

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          transcriptRef.current =
            `${transcriptRef.current} ${transcript}`.trim();
        } else {
          interim += transcript;
        }
      }
      setLiveTranscript(`${transcriptRef.current} ${interim}`.trim());
    };
    recognition.onerror = (event) => {
      setVoiceError(`Voice capture error: ${event.error}`);
      setVoiceListening(false);
    };
    recognition.onend = () => {
      setVoiceListening(false);
      const finalTranscript = transcriptRef.current.trim();
      if (finalTranscript) {
        void submitVoiceTranscript(finalTranscript);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [activeSession, ensureSession, submitVoiceTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const submitVisualContext = useCallback(async () => {
    if (!token || !visualTitle.trim() || !visualDescription.trim()) return;
    const session = (await ensureSession("video")) ?? activeSession;
    if (!session) return;

    setVisualBusy(true);
    try {
      const res = await api<{
        success: boolean;
        data: { session: AssistantSession; reply: string };
      }>(`/api/ai/sessions/${session.id}/visual-context`, {
        method: "POST",
        token,
        body: {
          title: visualTitle,
          description: visualDescription,
          fileName: visualPreview?.name,
          fileType: visualPreview?.type,
          fileSize: visualPreview?.size,
        },
      });
      setActiveSession(res.data.session);
      setVisualTitle("");
      setVisualDescription("");
      await loadWorkspace();
    } catch (err) {
      setAiStateError(
        err instanceof Error ? err.message : "Failed to save visual context",
      );
    } finally {
      setVisualBusy(false);
    }
  }, [
    activeSession,
    ensureSession,
    loadWorkspace,
    token,
    visualDescription,
    visualPreview,
    visualTitle,
  ]);

  const createDocumentFromSession = useCallback(
    async (
      kind: "report" | "invoice" | "agreement" | "brief",
      title: string,
    ) => {
      if (!token || !activeSession) return;
      setSavingSession(true);
      try {
        const res = await api<{
          success: boolean;
          data: { id: number; title: string };
        }>(`/api/ai/sessions/${activeSession.id}/create-document`, {
          method: "POST",
          token,
          body: { kind, title },
        });
        await loadWorkspace();
        void loadSession(activeSession.id);
        router.push(`/documents`);
        setAiStateError(`Document created: ${res.data.title}`);
      } catch (err) {
        setAiStateError(
          err instanceof Error ? err.message : "Failed to create document",
        );
      } finally {
        setSavingSession(false);
      }
    },
    [activeSession, loadSession, loadWorkspace, router, token],
  );

  const startQuickDocument = useCallback(
    async (
      kind: "report" | "invoice" | "agreement" | "brief",
      title: string,
      prompt: string,
    ) => {
      if (!token) return;
      try {
        await api("/api/documents", {
          method: "POST",
          token,
          body: { kind, title, prompt },
        });
        await loadWorkspace();
        router.push("/documents");
      } catch (err) {
        setAiStateError(
          err instanceof Error
            ? err.message
            : "Failed to create quick document",
        );
      }
    },
    [loadWorkspace, router, token],
  );

  const convertSessionToWorkflow = useCallback(
    async (task: string) => {
      if (!token || !activeSession) return;
      setPlanning(true);
      try {
        const res = await api<{ success: boolean; data: ActivePlan }>(
          `/api/ai/sessions/${activeSession.id}/create-workflow`,
          {
            method: "POST",
            token,
            body: { task },
          },
        );
        setActivePlan(res.data);
        await updateAiState({ mode: "agentic" });
        await loadWorkspace();
        void loadSession(activeSession.id);
      } catch (err) {
        setAiStateError(
          err instanceof Error
            ? err.message
            : "Failed to create workflow from session",
        );
      } finally {
        setPlanning(false);
      }
    },
    [activeSession, loadSession, loadWorkspace, token, updateAiState],
  );

  const handleTextSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void sendTextMessage(input);
    },
    [input, sendTextMessage],
  );

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activePlan, activeSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupported(
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
  }, []);

  useEffect(() => {
    if (!open || !token) return;
    setAiStateLoading(true);
    void loadWorkspace().finally(() => setAiStateLoading(false));
  }, [loadWorkspace, open, token]);

  useEffect(() => {
    if (!open || !aiState || !workspace) return;
    const candidate =
      activeSession?.mode === aiState.mode
        ? activeSession
        : sessionByMode.get(aiState.mode);
    if (candidate && candidate.id !== activeSession?.id) {
      void loadSession(candidate.id);
      return;
    }
    if (!candidate) {
      void createSession(aiState.mode);
    }
  }, [
    activeSession,
    aiState,
    createSession,
    loadSession,
    open,
    sessionByMode,
    workspace,
  ]);

  useEffect(() => {
    if (
      !initialPrompt ||
      !open ||
      initialPromptHandledRef.current === initialPrompt
    ) {
      return;
    }
    if (aiState?.mode && aiState.mode !== "agentic") {
      initialPromptHandledRef.current = initialPrompt;
      void sendTextMessage(initialPrompt);
    }
  }, [aiState?.mode, initialPrompt, open, sendTextMessage]);

  useEffect(() => {
    if (!open) {
      initialPromptHandledRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const mainContent = (() => {
    if (aiState?.mode === "voice") {
      return (
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Voice Session
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Live transcript and spoken briefings
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Capture spoken requests, review the transcript, then turn the
                  session into a summary or workflow.
                </p>
              </div>
              <StatusBadge status={voiceSupported ? "active" : "disabled"} />
            </div>
          </div>

          <div className="grid flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-h-0 flex-col rounded border border-border bg-background">
              <div className="border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={voiceListening ? "processing" : "inactive"}
                  />
                  <StatusBadge status={voiceBusy ? "pending" : "active"} />
                  <span className="text-xs text-muted">
                    {voiceListening
                      ? "Listening for speech"
                      : voiceBusy
                        ? "Processing transcript"
                        : "Ready for the next spoken turn"}
                  </span>
                </div>
                {voiceError && (
                  <p className="mt-2 text-xs text-danger">{voiceError}</p>
                )}
              </div>
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              >
                {voiceEntries.length === 0 && (
                  <div className="rounded border border-dashed border-border px-4 py-6 text-sm text-muted">
                    Start a voice session to capture live transcripts. Browser
                    speech APIs are used locally when available.
                  </div>
                )}
                {voiceEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded px-3 py-2 text-sm ${
                      entry.role === "user"
                        ? "bg-accent text-white"
                        : "border-l-2 border-ai bg-surface text-foreground shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                    <p
                      className={`mt-1 text-[10px] ${entry.role === "user" ? "text-white/60" : "text-muted"}`}
                    >
                      {new Date(entry.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
                {liveTranscript && (
                  <div className="rounded border border-ai/30 bg-ai-light/30 px-3 py-2 text-sm text-foreground">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Live transcript
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{liveTranscript}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Controls
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    data-agent-id="assistant-voice-start"
                    disabled={voiceListening || voiceBusy || !voiceSupported}
                    onClick={() => void startListening()}
                    className="flex items-center justify-center gap-2 rounded bg-ai px-4 py-3 text-sm font-medium text-white hover:bg-ai-hover disabled:opacity-50"
                  >
                    <Mic className="h-4 w-4" />
                    Start Listening
                  </button>
                  <button
                    type="button"
                    data-agent-id="assistant-voice-stop"
                    disabled={!voiceListening}
                    onClick={stopListening}
                    className="flex items-center justify-center gap-2 rounded border border-border px-4 py-3 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Stop Listening
                  </button>
                  <button
                    type="button"
                    data-agent-id="assistant-voice-replay"
                    disabled={voiceEntries.length === 0}
                    onClick={() => {
                      const latestAssistant = [...voiceEntries]
                        .reverse()
                        .find((entry) => entry.role === "assistant");
                      if (latestAssistant) speakText(latestAssistant.content);
                    }}
                    className="flex items-center justify-center gap-2 rounded border border-border px-4 py-3 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <Volume2 className="h-4 w-4" />
                    Speak Latest Reply
                  </button>
                </div>
              </div>

              <div className="rounded border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Handoff
                </p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    disabled={!activeSession || savingSession}
                    onClick={() =>
                      void createDocumentFromSession(
                        "brief",
                        "Voice Session Summary",
                      )
                    }
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <span>Save as summary</span>
                    <FileAudio className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!activeSession || planning}
                    onClick={() =>
                      void convertSessionToWorkflow(
                        "Use this voice briefing to create an operational workflow plan.",
                      )
                    }
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <span>Create workflow</span>
                    <Workflow className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (aiState?.mode === "video") {
      return (
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Visual Session
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Screenshot and dashboard-guided review
            </h2>
            <p className="mt-1 text-sm text-muted">
              Add visual context, capture what matters, then convert it into a
              report or workflow.
            </p>
          </div>

          <div className="grid flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-h-0 flex-col rounded border border-border bg-background">
              <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2">
                <label className="space-y-1 text-sm text-foreground">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Title
                  </span>
                  <input
                    value={visualTitle}
                    onChange={(event) => setVisualTitle(event.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                    placeholder="Invoice aging dashboard"
                  />
                </label>
                <label className="space-y-1 text-sm text-foreground">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Upload
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        setVisualPreview(null);
                        return;
                      }
                      const previewUrl = URL.createObjectURL(file);
                      setVisualPreview({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        previewUrl,
                      });
                    }}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm text-foreground md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Description
                  </span>
                  <textarea
                    rows={4}
                    value={visualDescription}
                    onChange={(event) =>
                      setVisualDescription(event.target.value)
                    }
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                    placeholder="Describe what the dashboard, screenshot, or visual artifact is showing."
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  {VISUAL_SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setVisualTitle(prompt);
                        setVisualDescription(
                          `Review the ${prompt.toLowerCase()} and summarize the highest-priority operational actions.`,
                        );
                      }}
                      className="rounded border border-ai/20 bg-ai-light/30 px-3 py-1.5 text-xs text-ai-foreground hover:bg-ai-light"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {visualPreview && (
                  <div className="overflow-hidden rounded border border-border bg-surface">
                    {visualPreview.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={visualPreview.previewUrl}
                        alt={visualPreview.name}
                        className="max-h-72 w-full object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
                      <span>{visualPreview.name}</span>
                      <span>{Math.round(visualPreview.size / 1024)} KB</span>
                    </div>
                  </div>
                )}

                {visualEntries.length === 0 && (
                  <div className="rounded border border-dashed border-border px-4 py-6 text-sm text-muted">
                    No visual context saved yet. Add a screenshot, note, or
                    dashboard description to start the visual session.
                  </div>
                )}

                {visualEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded px-3 py-2 text-sm ${
                      entry.role === "assistant"
                        ? "border-l-2 border-ai bg-surface text-foreground shadow-sm"
                        : "bg-background text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {new Date(entry.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded border border-border bg-background p-4">
                <button
                  type="button"
                  data-agent-id="assistant-visual-capture"
                  disabled={
                    visualBusy ||
                    !visualTitle.trim() ||
                    !visualDescription.trim()
                  }
                  onClick={() => void submitVisualContext()}
                  className="flex w-full items-center justify-center gap-2 rounded bg-ai px-4 py-3 text-sm font-medium text-white hover:bg-ai-hover disabled:opacity-50"
                >
                  <MonitorPlay className="h-4 w-4" />
                  Capture Visual Context
                </button>
              </div>

              <div className="rounded border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Handoff
                </p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    disabled={!activeSession || savingSession}
                    onClick={() =>
                      void createDocumentFromSession(
                        "report",
                        "Visual Review Summary",
                      )
                    }
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <span>Create report</span>
                    <FileText className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!activeSession || planning}
                    onClick={() =>
                      void convertSessionToWorkflow(
                        "Use this visual session to create a guided workflow plan inside eSupplyPro.",
                      )
                    }
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50"
                  >
                    <span>Create workflow</span>
                    <Workflow className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (aiState?.mode === "agentic") {
      return (
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Agentic Workflow
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Plan first, then execute inside eSupplyPro
            </h2>
            <p className="mt-1 text-sm text-muted">
              Create a plan, review the steps, then start, approve, and continue
              the run from one clear action at a time.
            </p>
          </div>

          <div className="grid flex-1 gap-4 overflow-hidden p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <div className="rounded border border-border bg-background p-4">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createPlanFromTask();
                  }}
                  className="space-y-3"
                >
                  <label className="block text-sm text-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Task
                    </span>
                    <textarea
                      rows={3}
                      value={agenticTask}
                      onChange={(event) => setAgenticTask(event.target.value)}
                      className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none"
                      placeholder="Check monthly reports and make a summary for finance review."
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setAgenticTask(prompt)}
                        className="rounded border border-ai/20 bg-ai-light/30 px-3 py-1.5 text-xs text-ai-foreground hover:bg-ai-light"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    data-agent-id="assistant-plan-create"
                    disabled={!agenticTask.trim() || planning}
                    className="rounded bg-ai px-4 py-2 text-sm font-medium text-white hover:bg-ai-hover disabled:opacity-50"
                  >
                    {planning ? "Planning..." : "Create Plan"}
                  </button>
                </form>
              </div>

              {activePlan ? (
                <div className="rounded border border-ai/25 bg-ai-light/20 p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ai-foreground">
                        Current Plan
                      </p>
                      <p className="mt-1 text-base font-medium text-foreground">
                        {activePlan.task}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {nextPlanActionCopy(activePlan)}
                      </p>
                    </div>
                    <StatusBadge status={activePlan.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Steps
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {activePlanCounts.completed}/{activePlanCounts.total}
                      </p>
                    </div>
                    <div className="rounded border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Approvals
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {activePlanCounts.approvals}
                      </p>
                    </div>
                    <div className="rounded border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Timeout
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {activePlan.timeoutSeconds
                          ? `${activePlan.timeoutSeconds}s`
                          : "n/a"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {activePlan.steps.map((step, index) => {
                      const StepIcon = ACTION_TYPE_META[step.actionType].icon;
                      const stepTone =
                        ACTION_TYPE_META[step.actionType].classes;
                      const stepComplete =
                        step.status === "completed" ||
                        step.status === "skipped";

                      return (
                        <div key={step.id}>
                          {index > 0 && (
                            <div className="ml-5 h-3 w-px bg-border" />
                          )}
                          <div className="flex items-start gap-3 rounded border border-border bg-surface px-3 py-3">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${stepTone}`}
                            >
                              {stepComplete ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : step.status === "running" ? (
                                <Clock3 className="h-4 w-4" />
                              ) : (
                                <StepIcon className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {step.stepNumber}. {step.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-muted">
                                    {ACTION_TYPE_META[step.actionType].label} ·{" "}
                                    {step.actionKey}
                                  </p>
                                </div>
                                <StatusBadge status={step.status} />
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {step.requiresApproval && (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Approval required
                                  </span>
                                )}
                                {step.status === "pending" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                    <Circle className="h-2.5 w-2.5" />
                                    Waiting
                                  </span>
                                )}
                              </div>
                              {step.lastError && (
                                <p className="mt-2 text-[11px] text-danger">
                                  {step.lastError}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {primaryPlanAction?.intent === "approve" && (
                      <button
                        type="button"
                        disabled={planning}
                        onClick={() => void updatePlanStatus("approve")}
                        className="rounded bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {primaryPlanAction.label}
                      </button>
                    )}
                    {primaryPlanAction?.intent === "run" && (
                      <button
                        type="button"
                        disabled={planning}
                        onClick={() => void runPlanStep()}
                        className="rounded border border-ai/30 px-3 py-2 text-xs font-medium text-ai-foreground hover:bg-ai-light/40 disabled:opacity-50"
                      >
                        {primaryPlanAction.label}
                      </button>
                    )}
                    {activePlan.status === "failed" && (
                      <button
                        type="button"
                        disabled={planning}
                        onClick={() => void updatePlanStatus("retry")}
                        className="rounded bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        Retry Failed Step
                      </button>
                    )}
                    {activePlan.status !== "cancelled" &&
                      activePlan.status !== "completed" && (
                        <button
                          type="button"
                          disabled={planning}
                          onClick={() => void updatePlanStatus("cancel")}
                          className="rounded border border-border px-3 py-2 text-xs text-foreground hover:bg-background disabled:opacity-50"
                        >
                          Cancel Plan
                        </button>
                      )}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed border-border px-4 py-8 text-sm text-muted">
                  No agentic plan loaded yet. Create a task above or pick a
                  pending approval from the workspace rail.
                </div>
              )}
            </div>

            <div className="space-y-4 overflow-y-auto">
              <div className="rounded border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Run Log
                </p>
                <div className="mt-3 space-y-2">
                  {activePlan?.events?.length ? (
                    activePlan.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded border border-border bg-surface px-3 py-2 text-xs text-foreground"
                      >
                        <p className="font-medium">{event.message}</p>
                        <p className="mt-1 text-muted">
                          {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No run events yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Artifacts
                </p>
                <div className="mt-3 space-y-2">
                  {activePlan?.artifacts?.length ? (
                    activePlan.artifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="rounded border border-border bg-surface px-3 py-2 text-xs text-foreground"
                      >
                        <p className="font-medium">{artifact.title}</p>
                        <p className="mt-1 text-muted">
                          {artifact.path ?? artifact.kind}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No artifacts yet.</p>
                  )}
                </div>
              </div>
              {agenticEntries.length > 0 && (
                <div className="rounded border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Session Notes
                  </p>
                  <div className="mt-3 space-y-2">
                    {agenticEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded border border-border bg-surface px-3 py-2 text-xs text-foreground"
                      >
                        <p>{entry.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="py-6 text-center text-sm text-muted">
                Ask about orders, products, invoices, documents, or workflows.
              </p>
              <div className="space-y-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendTextMessage(prompt)}
                    className="block w-full rounded border border-ai/20 bg-ai-light/50 px-3 py-2 text-left text-xs text-ai-foreground transition-colors hover:bg-ai-light"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-accent text-white"
                    : "border-l-2 border-ai bg-surface text-foreground shadow-sm"
                }`}
              >
                {message.role === "assistant" &&
                streamingMessageId === message.id &&
                !message.content ? (
                  <ThinkingIndicator tone="foreground" />
                ) : (
                  <p className="whitespace-pre-wrap">
                    {message.content}
                    {message.role === "assistant" &&
                      streamingMessageId === message.id && (
                        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-ai align-middle" />
                      )}
                  </p>
                )}
                <p
                  className={`mt-1 text-[10px] ${message.role === "user" ? "text-white/60" : "text-muted"}`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {(loading || loadingSession) && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded border-l-2 border-ai bg-surface px-3 py-2 shadow-sm">
                <ThinkingIndicator tone="foreground" />
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleTextSubmit}
          className="border-t border-border px-5 py-4"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholderForMode(aiState?.mode)}
              disabled={loading}
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm focus:border-ai focus:ring-1 focus:ring-ai focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="rounded bg-ai px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-ai-hover disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                <Send className="h-4 w-4" />
                Send
              </span>
            </button>
          </div>
        </form>
      </div>
    );
  })();

  return (
    <>
      {shellMode === "fullscreen" && (
        <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      )}
      <div className={getShellClasses(shellMode)}>
        <div className="flex h-full overflow-hidden">
          {shellMode !== "docked" && (
            <aside className="hidden w-64 shrink-0 border-r border-border bg-background/70 xl:flex xl:flex-col">
              <div className="border-b border-border px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Assistant Workspace
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Recent sessions, approvals, docs, memory, and connectors.
                </p>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Recent Sessions
                  </p>
                  <div className="mt-2 space-y-2">
                    {workspace?.sessions.length ? (
                      workspace.sessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            void loadSession(session.id);
                            void updateAiState({ mode: session.mode });
                          }}
                          className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
                            activeSession?.id === session.id
                              ? "border-ai bg-ai-light/40 text-ai-foreground"
                              : "border-border bg-surface text-foreground hover:bg-background"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{session.title}</span>
                            <StatusBadge status={modeLabel(session.mode)} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            {new Date(session.updatedAt).toLocaleString()}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        No sessions yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Frequent Topics
                  </p>
                  <div className="mt-2 space-y-2">
                    {workspace?.frequentPrompts.length ? (
                      workspace.frequentPrompts.map((prompt) => (
                        <button
                          key={prompt.id}
                          type="button"
                          onClick={() =>
                            void sendTextMessage(prompt.promptLabel)
                          }
                          className="w-full rounded border border-border bg-surface px-3 py-2 text-left text-xs text-foreground hover:bg-background"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="line-clamp-2 font-medium">
                              {prompt.promptLabel}
                            </span>
                            <span className="text-[10px] text-muted">
                              {prompt.hitCount}x
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            {modeLabel(prompt.sourceMode)} ·{" "}
                            {new Date(prompt.updatedAt).toLocaleDateString()}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        No frequent prompts yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Pending Approvals
                  </p>
                  <div className="mt-2 space-y-2">
                    {workspace?.pendingApprovals.length ? (
                      workspace.pendingApprovals.map((approval) => (
                        <button
                          key={approval.runId}
                          type="button"
                          onClick={() => {
                            void handleModeChange("agentic");
                            void loadPlan(approval.runId);
                          }}
                          className="w-full rounded border border-border bg-surface px-3 py-2 text-left text-xs text-foreground hover:bg-background"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              Workflow #{approval.runId}
                            </span>
                            <StatusBadge status={approval.status} />
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted">
                            {approval.task}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        No pending approvals.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Document Actions
                  </p>
                  <div className="mt-2 space-y-2">
                    {quickDocumentActions.map((action) => (
                      <button
                        key={`${action.kind}-${action.title}`}
                        type="button"
                        onClick={() =>
                          void startQuickDocument(
                            action.kind,
                            action.title,
                            action.prompt,
                          )
                        }
                        className="flex w-full items-center justify-between rounded border border-border bg-surface px-3 py-2 text-left text-xs text-foreground hover:bg-background"
                      >
                        <span>{action.title}</span>
                        <FolderKanban className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Connector Status
                  </p>
                  <div className="mt-2 space-y-2">
                    {workspace?.connectors.length ? (
                      workspace.connectors.map((connector) => (
                        <div
                          key={connector.id}
                          className="rounded border border-border bg-surface px-3 py-2 text-xs text-foreground"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {connector.provider}
                            </span>
                            <StatusBadge status={connector.status} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            {connector.accountIdentifier}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        No connector accounts yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Memory
                  </p>
                  <div className="mt-2 space-y-2">
                    {workspace?.recentMemory.length ? (
                      workspace.recentMemory.map((memory) => (
                        <div
                          key={memory.id}
                          className="rounded border border-border bg-surface px-3 py-2 text-xs text-foreground"
                        >
                          <p className="font-medium">{memory.title}</p>
                          <p className="mt-1 line-clamp-3 text-[11px] text-muted">
                            {memory.content}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        No saved memory yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          )}

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-ai" />
                    <span className="text-sm font-semibold text-foreground">
                      eSupplyPro Assistant
                    </span>
                  </div>
                  {aiState && (
                    <p className="mt-1 text-[11px] text-muted">
                      {roleLabel(aiState.role)} · {modeLabel(aiState.mode)} ·{" "}
                      {aiState.autonomy}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onShellModeChange(
                        shellMode === "docked" ? "workspace" : "docked",
                      )
                    }
                    className="rounded border border-border p-2 text-muted hover:bg-background hover:text-foreground"
                    title={
                      shellMode === "docked"
                        ? "Open workspace"
                        : "Dock assistant"
                    }
                  >
                    {shellMode === "docked" ? (
                      <Maximize2 className="h-4 w-4" />
                    ) : (
                      <Minimize2 className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onShellModeChange(
                        shellMode === "fullscreen" ? "workspace" : "fullscreen",
                      )
                    }
                    className="rounded border border-border p-2 text-muted hover:bg-background hover:text-foreground"
                    title={
                      shellMode === "fullscreen"
                        ? "Exit fullscreen"
                        : "Open fullscreen workspace"
                    }
                  >
                    <MonitorPlay className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded border border-border p-2 text-muted hover:bg-background hover:text-foreground"
                    title="Close assistant"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Autonomy
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {AUTONOMY_ITEMS.map((item) => {
                      const active = aiState?.autonomy === item.value;
                      const enabled =
                        aiState?.availableAutonomy.includes(item.value) ??
                        false;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          data-agent-id={`assistant-autonomy-${item.value}`}
                          disabled={!enabled || aiStateSaving}
                          onClick={() => void handleAutonomyChange(item.value)}
                          className={`rounded border px-2 py-2 text-left transition-colors ${
                            active
                              ? "border-accent bg-accent-light text-accent"
                              : enabled
                                ? "border-border text-muted hover:bg-background hover:text-foreground"
                                : "border-border/50 text-muted/50 opacity-60"
                          }`}
                        >
                          <p className="text-xs font-medium">{item.label}</p>
                          <p className="mt-1 text-[10px] leading-4 opacity-80">
                            {item.helper}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="min-w-0 lg:w-[360px]">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Mode
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MODE_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isAgentic = item.value === "agentic";
                      const active = aiState?.mode === item.value;
                      const enabledByRole =
                        aiState?.availableModes.includes(item.value) ?? false;
                      const enabled =
                        enabledByRole && (!isAgentic || agenticUnlocked);
                      return (
                        <button
                          key={item.value}
                          type="button"
                          data-agent-id={`assistant-mode-${item.value === "video" ? "visual" : item.value}`}
                          disabled={!enabled || aiStateSaving}
                          onClick={() => void handleModeChange(item.value)}
                          className={`flex items-start gap-2 rounded border px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-ai bg-ai-light/60 text-ai-foreground"
                              : enabled
                                ? "border-border text-muted hover:bg-background hover:text-foreground"
                                : "border-border/50 text-muted/50 opacity-60"
                          }`}
                        >
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{item.label}</p>
                            <p className="mt-1 text-[10px] leading-4 opacity-80">
                              {item.helper}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {(aiStateLoading ||
                workspaceLoading ||
                aiStateSaving ||
                savingSession) && (
                <div className="mt-3">
                  <ThinkingIndicator />
                </div>
              )}
              {aiStateError && (
                <div className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {aiStateError}
                </div>
              )}
            </div>

            {mainContent}
          </section>
        </div>
      </div>
    </>
  );
}
