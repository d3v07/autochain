"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  Compass,
  FileText,
  Files,
  LayoutDashboard,
  Lock,
  Mail,
  Package,
  Play,
  PlugZap,
  Receipt,
  RefreshCcw,
  Search,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { ThinkingIndicator } from "@/components/thinking-indicator";

interface WorkflowStep {
  id: number;
  stepNumber: number;
  title: string;
  actionKey: string;
  actionType: "navigate" | "query" | "generate" | "mutate" | "connector";
  target: string | null;
  payload: Record<string, unknown>;
  status:
    | "pending"
    | "approved"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "skipped";
  requiresApproval: boolean;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  checkpointData: Record<string, unknown>;
}

interface WorkflowArtifact {
  id: number;
  kind: string;
  title: string;
  path: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

interface WorkflowEvent {
  id: number;
  eventType: string;
  message: string;
  createdAt: string;
}

interface WorkflowRun {
  id: number;
  task: string;
  status:
    | "planned"
    | "running"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  mode: "text" | "voice" | "video" | "agentic";
  autonomy: "manual" | "ask" | "agent";
  currentStepIndex: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  steps: WorkflowStep[];
  events?: WorkflowEvent[];
  artifacts?: WorkflowArtifact[];
}

type ActionType = WorkflowStep["actionType"];

interface SandboxAction {
  key: string;
  label: string;
  description: string;
  route: string;
  dataAgentId: string;
  actionType: ActionType;
  sideEffect: boolean;
  requiresApproval: boolean;
  tags: string[];
}

interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  actionKeys: string[];
  defaultObjective: string;
  icon: LucideIcon;
}

const ACTION_TYPE_ORDER: ActionType[] = [
  "navigate",
  "query",
  "generate",
  "mutate",
  "connector",
];

const ACTION_TYPE_META: Record<
  ActionType,
  {
    label: string;
    icon: LucideIcon;
    iconClasses: string;
    chipClasses: string;
  }
> = {
  navigate: {
    label: "Navigate",
    icon: Compass,
    iconClasses: "border-slate-200 bg-slate-100 text-slate-700",
    chipClasses: "bg-slate-100 text-slate-700",
  },
  query: {
    label: "Query",
    icon: Search,
    iconClasses: "border-blue-100 bg-blue-50 text-blue-700",
    chipClasses: "bg-blue-50 text-blue-700",
  },
  generate: {
    label: "Generate",
    icon: Sparkles,
    iconClasses: "border-emerald-100 bg-emerald-50 text-emerald-700",
    chipClasses: "bg-emerald-50 text-emerald-700",
  },
  mutate: {
    label: "Mutate",
    icon: ShieldAlert,
    iconClasses: "border-amber-100 bg-amber-50 text-amber-700",
    chipClasses: "bg-amber-50 text-amber-700",
  },
  connector: {
    label: "Connector",
    icon: PlugZap,
    iconClasses: "border-rose-100 bg-rose-50 text-rose-700",
    chipClasses: "bg-rose-50 text-rose-700",
  },
};

const ACTION_ICON_OVERRIDES: Record<string, LucideIcon> = {
  "navigate.dashboard": LayoutDashboard,
  "navigate.products": Package,
  "navigate.orders": ShoppingCart,
  "navigate.invoices": Receipt,
  "navigate.documents": Files,
  "navigate.workflows": Workflow,
  "navigate.admin.dashboard": Shield,
  "navigate.admin.users": Users,
  "navigate.admin.sessions": Lock,
  "report.generate_monthly": FileText,
  "report.check_overdue_invoices": Receipt,
  "report.inventory_reorder": Package,
  "report.customer_risk": ShieldAlert,
  "document.generate_agreement": FileText,
  "connector.gmail.compose": Mail,
  "session.review_risky": Search,
  "session.revoke": ShieldAlert,
  "user.disable": Users,
};

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "monthly-summary",
    title: "Monthly Summary",
    description:
      "Review the dashboard, gather account context, and generate a summary document.",
    actionKeys: [
      "navigate.dashboard",
      "navigate.orders",
      "report.generate_monthly",
      "navigate.documents",
    ],
    defaultObjective:
      "Build a monthly business summary with order activity, invoice status, and next actions.",
    icon: FileText,
  },
  {
    id: "overdue-invoices",
    title: "Overdue Invoices",
    description:
      "Move from invoices to a finance review document with explicit approval points.",
    actionKeys: [
      "navigate.invoices",
      "report.check_overdue_invoices",
      "navigate.documents",
    ],
    defaultObjective:
      "Review overdue invoices, summarize exposure, and prepare a finance follow-up packet.",
    icon: Receipt,
  },
  {
    id: "reorder-recommendations",
    title: "Reorder Suggestions",
    description:
      "Inspect product context, then produce a restock recommendation workflow.",
    actionKeys: [
      "navigate.products",
      "report.inventory_reorder",
      "navigate.documents",
    ],
    defaultObjective:
      "Analyze current product availability and generate inventory reorder recommendations.",
    icon: Package,
  },
  {
    id: "agreement-draft",
    title: "Agreement Draft",
    description:
      "Enter document mode directly and produce a draft agreement for review.",
    actionKeys: ["navigate.documents", "document.generate_agreement"],
    defaultObjective:
      "Draft a customer agreement with clear terms, review checkpoints, and approval gates.",
    icon: Files,
  },
  {
    id: "risk-sweep",
    title: "Risk Sweep",
    description:
      "Admin-only risk review across dashboard, sessions, and reporting.",
    actionKeys: [
      "navigate.admin.dashboard",
      "session.review_risky",
      "report.customer_risk",
      "navigate.admin.sessions",
    ],
    defaultObjective:
      "Review customer risk signals, summarize the riskiest accounts, and prepare operator actions.",
    icon: Shield,
  },
  {
    id: "ops-follow-up",
    title: "Ops Follow-Up",
    description:
      "Admin-only workflow that drafts a report and prepares connector-based outreach.",
    actionKeys: [
      "navigate.admin.dashboard",
      "report.customer_risk",
      "connector.gmail.compose",
    ],
    defaultObjective:
      "Create an operational report and prepare a Gmail draft for follow-up on flagged accounts.",
    icon: Mail,
  },
];

function buildWorkflowTask(
  objective: string,
  selectedActions: SandboxAction[],
) {
  const cleanObjective = objective.trim();
  const stepLines = selectedActions
    .map(
      (action, index) =>
        `${index + 1}. ${action.label} (${action.key}) - ${action.description}`,
    )
    .join("\n");

  return [
    cleanObjective || "Run the selected AutoChain sandbox workflow.",
    "Stay inside the AutoChain application sandbox.",
    "Use these small, justifiable actions in this sequence when possible:",
    stepLines,
    "Require approval before any side effect and explain each step before execution.",
  ].join("\n\n");
}

function getActionPresentation(action: SandboxAction | WorkflowStep) {
  const fallback = ACTION_TYPE_META[action.actionType];
  const actionIdentifier =
    "actionKey" in action ? action.actionKey : action.key;
  return {
    ...fallback,
    icon: ACTION_ICON_OVERRIDES[actionIdentifier] ?? fallback.icon,
  };
}

function formatWorkflowSummary(run: WorkflowRun) {
  const approvalCount = run.steps.filter(
    (step) => step.requiresApproval,
  ).length;
  return `${run.steps.length} step${run.steps.length === 1 ? "" : "s"} · ${approvalCount} approval gate${approvalCount === 1 ? "" : "s"}`;
}

function getRunPrimaryAction(run: WorkflowRun | null) {
  if (!run) return null;
  if (run.status === "planned") {
    return { label: "Start Plan", action: "run-next" as const };
  }
  if (run.status === "waiting_approval") {
    return { label: "Approve Next Step", action: "approve" as const };
  }
  if (run.status === "running") {
    return { label: "Continue Plan", action: "run-next" as const };
  }
  return null;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selected, setSelected] = useState<WorkflowRun | null>(null);
  const [actions, setActions] = useState<SandboxAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const [objective, setObjective] = useState(
    "Build a monthly operational workflow with clear review and approval steps.",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedActionKeys, setSelectedActionKeys] = useState<string[]>([]);
  const [builderInitialized, setBuilderInitialized] = useState(false);

  const actionMap = useMemo(
    () => new Map(actions.map((action) => [action.key, action])),
    [actions],
  );

  const availableTemplates = useMemo(
    () =>
      WORKFLOW_TEMPLATES.filter((template) =>
        template.actionKeys.every((key) => actionMap.has(key)),
      ),
    [actionMap],
  );

  const groupedActions = useMemo(
    () =>
      ACTION_TYPE_ORDER.map((type) => ({
        type,
        items: actions.filter((action) => action.actionType === type),
      })).filter((group) => group.items.length > 0),
    [actions],
  );

  const builderActions = useMemo(
    () =>
      selectedActionKeys
        .map((key) => actionMap.get(key))
        .filter((action): action is SandboxAction => Boolean(action)),
    [selectedActionKeys, actionMap],
  );

  const builderTask = useMemo(
    () => buildWorkflowTask(objective, builderActions),
    [objective, builderActions],
  );
  const selectedPrimaryAction = useMemo(
    () => getRunPrimaryAction(selected),
    [selected],
  );

  const approvalCount = builderActions.filter(
    (action) => action.requiresApproval,
  ).length;
  const sideEffectCount = builderActions.filter(
    (action) => action.sideEffect,
  ).length;

  async function loadRuns() {
    if (!token) return;
    const [runsRes, actionsRes] = await Promise.all([
      api<{ data: WorkflowRun[] }>("/api/workflows", { token }),
      api<{ data: SandboxAction[] }>("/api/workflows/actions", { token }),
    ]);
    setRuns(runsRes.data);
    setActions(actionsRes.data);
  }

  async function loadRun(id: number) {
    if (!token) return;
    const res = await api<{ data: WorkflowRun }>(`/api/workflows/${id}`, {
      token,
    });
    setSelected(res.data);
  }

  useEffect(() => {
    if (!token) return;
    loadRuns()
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load workflows",
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (builderInitialized || availableTemplates.length === 0) return;
    const initialTemplate = availableTemplates[0];
    setSelectedTemplateId(initialTemplate.id);
    setSelectedActionKeys(initialTemplate.actionKeys);
    setObjective(initialTemplate.defaultObjective);
    setBuilderInitialized(true);
  }, [availableTemplates, builderInitialized]);

  function applyTemplate(template: WorkflowTemplate) {
    setSelectedTemplateId(template.id);
    setSelectedActionKeys(template.actionKeys);
    setObjective(template.defaultObjective);
  }

  function toggleAction(key: string) {
    setSelectedTemplateId(null);
    setSelectedActionKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  function moveAction(index: number, direction: -1 | 1) {
    setSelectedTemplateId(null);
    setSelectedActionKeys((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function removeAction(key: string) {
    setSelectedTemplateId(null);
    setSelectedActionKeys((prev) => prev.filter((item) => item !== key));
  }

  async function createRun() {
    if (!token || builderActions.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api<{ data: WorkflowRun }>("/api/workflows", {
        method: "POST",
        token,
        body: { task: builderTask },
      });
      await loadRuns();
      setSelected(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create workflow",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function mutateRun(path: string, actionName: string) {
    if (!token || !selected) return;
    setSubmitting(true);
    setPendingMutation(actionName);
    setError("");

    try {
      const res = await api<{
        data: WorkflowRun | null;
        clientAction?: {
          type: "navigate";
          href: string;
          dataAgentId: string;
        } | null;
        notice?: string | null;
      }>(path, {
        method: "POST",
        token,
      });

      if (res.data) {
        setSelected(res.data);
      }
      await loadRuns();

      const clientAction = (res as { clientAction?: { href: string } })
        .clientAction;
      if (clientAction?.href) {
        router.push(clientAction.href);
      }
      if ("notice" in res && res.notice) {
        setError(res.notice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow action failed");
    } finally {
      setSubmitting(false);
      setPendingMutation(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Workflow Builder
          </h1>
          <p className="mt-1 text-sm text-muted">
            Compose flows from small, justifiable sandbox actions with
            approvals, retries, and checkpoints.
          </p>
        </div>

        {error && (
          <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="rounded border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Action Library
              </h2>
              <p className="mt-1 text-sm text-muted">
                Add compact nodes to the builder. Everything stays inside
                eSupplyPro.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
              App sandbox only
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {groupedActions.map((group) => {
              const meta = ACTION_TYPE_META[group.type];
              const GroupIcon = meta.icon;

              return (
                <div key={group.type}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full border ${meta.iconClasses}`}
                    >
                      <GroupIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {meta.label}
                      </p>
                      <p className="text-xs text-muted">
                        {group.items.length} available action
                        {group.items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.items.map((action) => {
                      const presentation = getActionPresentation(action);
                      const ActionIcon = presentation.icon;
                      const isSelected = selectedActionKeys.includes(
                        action.key,
                      );

                      return (
                        <div
                          key={action.key}
                          className={`rounded-xl border px-3 py-3 transition-colors ${
                            isSelected
                              ? "border-accent bg-accent-light/20"
                              : "border-border bg-background"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border ${presentation.iconClasses}`}
                            >
                              <ActionIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {action.label}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-muted">
                                    {action.description}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleAction(action.key)}
                                  className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
                                    isSelected
                                      ? "bg-accent text-white hover:bg-accent-hover"
                                      : "border border-border text-foreground hover:bg-surface"
                                  }`}
                                >
                                  {isSelected ? "Added" : "Add"}
                                </button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${presentation.chipClasses}`}
                                >
                                  {ACTION_TYPE_META[action.actionType].label}
                                </span>
                                {action.requiresApproval && (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Approval
                                  </span>
                                )}
                                {action.sideEffect && (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                    Side effect
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Workflow Runs
            </h2>
          </div>
          {loading ? (
            <div className="px-4 py-6">
              <ThinkingIndicator className="justify-center" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => loadRun(run.id)}
                  className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-background ${
                    selected?.id === run.id ? "bg-accent-light/20" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {run.task.split("\n")[0]}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatWorkflowSummary(run)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={run.status} />
                </button>
              ))}
              {runs.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  No workflows created yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <Workflow className="h-3.5 w-3.5" />
                Builder Canvas
              </div>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                n8n-style workflow draft
              </h2>
              <p className="mt-1 text-sm text-muted">
                Pick a template, refine the objective, and assemble the exact
                in-app actions you want the runtime to follow.
              </p>
            </div>
            <div className="grid min-w-[220px] grid-cols-3 gap-2">
              <div className="rounded border border-border bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Nodes
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {builderActions.length}
                </p>
              </div>
              <div className="rounded border border-border bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Approvals
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {approvalCount}
                </p>
              </div>
              <div className="rounded border border-border bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Side Effects
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {sideEffectCount}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Templates
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {availableTemplates.map((template) => {
                const TemplateIcon = template.icon;
                const active = selectedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-accent bg-accent-light/30"
                        : "border-border bg-background hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/20 bg-accent-light/40 text-accent">
                        <TemplateIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {template.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <label
                htmlFor="workflow-objective"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Objective
              </label>
              <textarea
                id="workflow-objective"
                value={objective}
                onChange={(e) => {
                  setSelectedTemplateId(null);
                  setObjective(e.target.value);
                }}
                rows={4}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm focus:border-accent focus:outline-none"
                placeholder="Describe the business outcome you want from this workflow."
              />
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  Runtime gets the objective plus the node list below
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  Side effects still require approval
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Runtime Prompt Preview
              </p>
              <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted">
                {builderTask}
              </pre>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-[radial-gradient(circle_at_1px_1px,rgba(15,81,50,0.12)_1px,transparent_0)] bg-[size:18px_18px] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <Sparkles className="h-3.5 w-3.5" />
              Visual Flow
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-foreground">Start</p>
                  <p className="mt-1 text-xs text-muted">
                    Receive the objective and lock execution to eSupplyPro-only
                    sandbox actions.
                  </p>
                </div>
              </div>

              {builderActions.map((action, index) => {
                const presentation = getActionPresentation(action);
                const ActionIcon = presentation.icon;

                return (
                  <Fragment key={action.key}>
                    <div className="ml-5 h-4 w-px bg-border" />
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${presentation.iconClasses}`}
                      >
                        <ActionIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {index + 1}. {action.label}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${presentation.chipClasses}`}
                              >
                                {ACTION_TYPE_META[action.actionType].label}
                              </span>
                              {action.requiresApproval && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                  Approval
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              {action.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {action.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => moveAction(index, -1)}
                              disabled={index === 0}
                              className="rounded border border-border p-1 text-muted hover:bg-background disabled:opacity-40"
                              aria-label={`Move ${action.label} up`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAction(index, 1)}
                              disabled={index === builderActions.length - 1}
                              className="rounded border border-border p-1 text-muted hover:bg-background disabled:opacity-40"
                              aria-label={`Move ${action.label} down`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAction(action.key)}
                              className="rounded border border-border p-1 text-muted hover:bg-background"
                              aria-label={`Remove ${action.label}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })}

              <div className="ml-5 h-4 w-px bg-border" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
                  <Play className="h-4 w-4" />
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-foreground">
                    Ready for runtime
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    The workflow runtime will plan, checkpoint, and request
                    approval where required.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {builderActions.length > 0
                ? `${builderActions.length} node${builderActions.length === 1 ? "" : "s"} selected for this workflow draft.`
                : "Add at least one action from the library to create a workflow."}
            </div>
            <button
              type="button"
              data-agent-id="workflow-create"
              disabled={submitting || builderActions.length === 0}
              onClick={createRun}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? (
                <ThinkingIndicator tone="light" className="justify-center" />
              ) : (
                "Create Workflow"
              )}
            </button>
          </div>
        </div>

        <div className="rounded border border-border bg-surface p-5">
          {selected ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active Run
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">
                    Workflow #{selected.id}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {selected.task.split("\n")[0]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.mode} />
                  <StatusBadge status={selected.autonomy} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedPrimaryAction?.action === "approve" && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      mutateRun(
                        `/api/workflows/${selected.id}/approve`,
                        "approve",
                      )
                    }
                    className="rounded bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {pendingMutation === "approve" ? (
                      <ThinkingIndicator
                        tone="light"
                        className="justify-center"
                      />
                    ) : (
                      selectedPrimaryAction.label
                    )}
                  </button>
                )}
                {selectedPrimaryAction?.action === "run-next" && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      mutateRun(
                        `/api/workflows/${selected.id}/run-next`,
                        "run-next",
                      )
                    }
                    className="rounded border border-ai/30 px-3 py-2 text-xs font-medium text-ai-foreground hover:bg-ai-light/40 disabled:opacity-50"
                  >
                    {pendingMutation === "run-next" ? (
                      <ThinkingIndicator className="justify-center" />
                    ) : (
                      selectedPrimaryAction.label
                    )}
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    mutateRun(`/api/workflows/${selected.id}/retry`, "retry")
                  }
                  className="rounded border border-border px-3 py-2 text-xs text-foreground hover:bg-background disabled:opacity-50"
                >
                  {pendingMutation === "retry" ? (
                    <ThinkingIndicator className="justify-center" />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Retry Failed Step
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    mutateRun(`/api/workflows/${selected.id}/cancel`, "cancel")
                  }
                  className="rounded border border-danger/30 px-3 py-2 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {pendingMutation === "cancel" ? (
                    <ThinkingIndicator className="justify-center" />
                  ) : (
                    "Cancel"
                  )}
                </button>
              </div>

              {selected.lastError && (
                <div className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {selected.lastError}
                </div>
              )}

              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Runtime Steps
                  </h3>
                  <div className="mt-4 space-y-2">
                    {selected.steps.map((step, index) => {
                      const presentation = getActionPresentation(step);
                      const StepIcon = presentation.icon;
                      const matchingAction = actionMap.get(step.actionKey);

                      return (
                        <Fragment key={step.id}>
                          {index > 0 && (
                            <div className="ml-5 h-3 w-px bg-border" />
                          )}
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${presentation.iconClasses}`}
                            >
                              <StepIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">
                                      {step.stepNumber}. {step.title}
                                    </p>
                                    <StatusBadge status={step.status} />
                                  </div>
                                  <p className="mt-1 text-xs text-muted">
                                    {step.actionKey}
                                    {step.target ? ` · ${step.target}` : ""}
                                  </p>
                                  <p className="mt-2 text-xs leading-5 text-muted">
                                    {matchingAction?.description ??
                                      "Sandbox step recorded by the workflow runtime."}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${presentation.chipClasses}`}
                                    >
                                      {ACTION_TYPE_META[step.actionType].label}
                                    </span>
                                    {step.requiresApproval && (
                                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                        Approval
                                      </span>
                                    )}
                                    {step.retryCount > 0 && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                        Retry {step.retryCount}/
                                        {step.maxRetries}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {step.lastError && (
                                <p className="mt-2 text-xs text-danger">
                                  {step.lastError}
                                </p>
                              )}
                            </div>
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Artifacts
                  </h3>
                  <div className="mt-3 space-y-2">
                    {(selected.artifacts ?? []).map((artifact) => (
                      <div
                        key={artifact.id}
                        className="rounded border border-border px-3 py-2"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {artifact.title}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {artifact.kind}
                        </p>
                        {artifact.path && (
                          <p className="mt-1 break-all text-[11px] text-muted">
                            {artifact.path}
                          </p>
                        )}
                      </div>
                    ))}
                    {(!selected.artifacts ||
                      selected.artifacts.length === 0) && (
                      <p className="rounded border border-dashed border-border px-3 py-4 text-sm text-muted">
                        No artifacts yet.
                      </p>
                    )}
                  </div>

                  <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
                    Recent Events
                  </h3>
                  <div className="mt-3 space-y-2">
                    {(selected.events ?? []).slice(0, 8).map((event) => (
                      <div
                        key={event.id}
                        className="rounded border border-border px-3 py-2"
                      >
                        <p className="text-sm text-foreground">
                          {event.message}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {event.eventType} ·{" "}
                          {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {(!selected.events || selected.events.length === 0) && (
                      <p className="rounded border border-dashed border-border px-3 py-4 text-sm text-muted">
                        No events recorded yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-light/40 text-accent">
                  <ArrowRight className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  Create or select a workflow run
                </p>
                <p className="mt-2 text-sm text-muted">
                  The builder above is for composing the workflow. The selected
                  run view shows the runtime steps, events, and artifacts after
                  creation.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
