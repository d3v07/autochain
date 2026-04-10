import { desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import {
  workflowArtifacts,
  workflowCheckpoints,
  workflowEvents,
  workflowRuns,
  workflowSteps,
  userSessions,
} from "@autochain/db";
import {
  WorkflowAgentRole as WorkflowAgentRoleSchema,
  WorkflowOrchestrationStrategy as WorkflowOrchestrationStrategySchema,
} from "@autochain/shared";
import type {
  SandboxAction,
  WorkflowAgent,
  WorkflowAgentRole,
  WorkflowOrchestration,
  WorkflowOrchestrationStrategy,
  WorkflowArtifact,
  WorkflowEvent,
  WorkflowRun,
  WorkflowStep,
} from "@autochain/shared";
import { createGeneratedDocument } from "./document-studio.js";
import {
  getAllowedSandboxActions,
  getSandboxAction,
} from "./sandbox-actions.js";
import { persistWorkflowArtifact } from "./storage.js";

const WORKFLOW_TIMEOUT_SECONDS = Number(
  process.env.WORKFLOW_TIMEOUT_SECONDS ?? 900,
);

const WORKFLOW_AGENT_ROLES = WorkflowAgentRoleSchema.options;
const WORKFLOW_ORCHESTRATION_STRATEGIES =
  WorkflowOrchestrationStrategySchema.options;

type PlannedStep = {
  title: string;
  actionKey: string;
  actionType: SandboxAction["actionType"];
  target: string | null;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
  agentRole: WorkflowAgentRole | null;
  dependsOnStepNumbers: number[];
  parallelGroup: string | null;
};

type WorkflowDraft = {
  steps: PlannedStep[];
  restrictedActionKeys: string[];
  orchestration: WorkflowOrchestration | null;
};

function parseJsonObject(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isWorkflowAgentRole(value: unknown): value is WorkflowAgentRole {
  return (
    typeof value === "string" &&
    (WORKFLOW_AGENT_ROLES as readonly string[]).includes(value)
  );
}

function isWorkflowOrchestrationStrategy(
  value: unknown,
): value is WorkflowOrchestrationStrategy {
  return (
    typeof value === "string" &&
    (WORKFLOW_ORCHESTRATION_STRATEGIES as readonly string[]).includes(value)
  );
}

function parseNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
}

function parseAssignments(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, WorkflowAgentRole] =>
        isWorkflowAgentRole(entry[1]),
    ),
  );
}

function parseAgent(value: unknown): WorkflowAgent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isWorkflowAgentRole(candidate.role) ||
    typeof candidate.label !== "string" ||
    typeof candidate.objective !== "string"
  ) {
    return null;
  }

  return {
    role: candidate.role,
    label: candidate.label,
    objective: candidate.objective,
    capabilities: Array.isArray(candidate.capabilities)
      ? candidate.capabilities.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

function parseOrchestration(value: unknown): WorkflowOrchestration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isWorkflowAgentRole(candidate.coordinatorRole) ||
    !isWorkflowOrchestrationStrategy(candidate.strategy) ||
    typeof candidate.summary !== "string"
  ) {
    return null;
  }

  const agents = Array.isArray(candidate.agents)
    ? candidate.agents
        .map((item) => parseAgent(item))
        .filter((item): item is WorkflowAgent => Boolean(item))
    : [];

  if (agents.length === 0) {
    return null;
  }

  return {
    enabled: candidate.enabled !== false,
    coordinatorRole: candidate.coordinatorRole,
    strategy: candidate.strategy,
    summary: candidate.summary,
    agents,
    assignments: parseAssignments(candidate.assignments),
  };
}

function getActionDefaultPayload(actionKey: string, task: string) {
  switch (actionKey) {
    case "report.generate_monthly":
      return {
        documentKind: "report",
        template: "monthly_summary",
        task,
      };
    case "report.vendor_monthly":
      return {
        documentKind: "report",
        template: "vendor_monthly",
        task,
      };
    case "report.check_overdue_invoices":
      return {
        documentKind: "invoice",
        template: "overdue_invoices",
        task,
      };
    case "report.vendor_invoice_review":
      return {
        documentKind: "report",
        template: "vendor_invoice_review",
        task,
      };
    case "report.inventory_reorder":
      return {
        documentKind: "report",
        template: "inventory_reorder",
        task,
      };
    case "report.vendor_catalog_health":
      return {
        documentKind: "report",
        template: "vendor_catalog_health",
        task,
      };
    case "report.customer_risk":
      return {
        documentKind: "report",
        template: "customer_risk",
        task,
      };
    case "document.generate_agreement":
      return {
        documentKind: "agreement",
        template: "agreement",
        task,
      };
    case "connector.gmail.compose":
      return {
        provider: "gmail",
        task,
      };
    case "user.disable":
    case "session.revoke":
      return {
        task,
        targetRequired: true,
      };
    default:
      return { task };
  }
}

function inferAgentRoleForAction(
  actionKey: string,
  actionType: SandboxAction["actionType"],
  orchestration: WorkflowOrchestration,
) {
  const availableRoles = new Set(
    orchestration.agents.map((agent) => agent.role),
  );
  const preferredRole =
    actionKey.includes("invoice") || actionKey.includes("finance")
      ? "finance_analyst"
      : actionKey.includes("inventory") ||
          actionKey.includes("catalog") ||
          actionKey.includes("products")
        ? "inventory_analyst"
        : actionKey.includes("purchase-orders") || actionKey.includes("vendor")
          ? "supplier_manager"
          : actionKey.includes("shipment") || actionKey.includes("logistics")
            ? "logistics_coordinator"
            : actionKey.includes("agreement") || actionKey.includes("document")
              ? "document_specialist"
              : actionKey.includes("risk") || actionKey.includes("session")
                ? "risk_guardian"
                : actionType === "connector"
                  ? "comms_coordinator"
                  : "ops_analyst";

  if (availableRoles.has(preferredRole)) {
    return preferredRole;
  }
  if (availableRoles.has(orchestration.coordinatorRole)) {
    return orchestration.coordinatorRole;
  }
  return orchestration.agents[0]?.role ?? null;
}

function applyOrchestrationToSteps(
  steps: PlannedStep[],
  orchestration: WorkflowOrchestration | null,
) {
  if (!orchestration || !orchestration.enabled || steps.length === 0) {
    return steps;
  }

  const assignedSteps: PlannedStep[] = steps.map((step) => ({
    ...step,
    agentRole:
      orchestration.assignments[step.actionKey] ??
      inferAgentRoleForAction(step.actionKey, step.actionType, orchestration),
    dependsOnStepNumbers: [] as number[],
    parallelGroup: null as string | null,
  }));

  if (
    orchestration.strategy === "parallel_fanout" &&
    assignedSteps.length > 2
  ) {
    const fanoutSteps = assignedSteps.slice(1, -1);

    if (fanoutSteps.length > 0) {
      fanoutSteps.forEach((step) => {
        step.dependsOnStepNumbers = [1];
        step.parallelGroup = "fanout-1";
      });

      if (assignedSteps.length > 3) {
        assignedSteps[assignedSteps.length - 1]!.dependsOnStepNumbers =
          fanoutSteps.map((_, index) => index + 2);
      }
    } else {
      assignedSteps[1]!.dependsOnStepNumbers = [1];
    }

    return assignedSteps;
  }

  return assignedSteps.map((step, index) => ({
    ...step,
    dependsOnStepNumbers: index === 0 ? ([] as number[]) : [index],
  }));
}

function inferOrchestrationFromTask(
  task: string,
  role: "customer" | "vendor" | "admin",
) {
  const normalized = task.toLowerCase();
  const orchestrationRequested =
    normalized.includes("multi-agent") ||
    normalized.includes("multi agent") ||
    normalized.includes("orchestrate") ||
    normalized.includes("control tower") ||
    normalized.includes("war room");

  if (!orchestrationRequested) {
    return null;
  }

  if (role === "admin" || normalized.includes("risk")) {
    return {
      enabled: true,
      coordinatorRole: "orchestrator" as const,
      strategy: "parallel_fanout" as const,
      summary:
        "Admin orchestration splits investigation across risk, operations, and outreach lanes before consolidation.",
      agents: [
        {
          role: "orchestrator" as const,
          label: "Orchestrator",
          objective:
            "Sequence the investigation and merge cross-functional outputs.",
          capabilities: ["routing", "handoffs", "checkpointing"],
        },
        {
          role: "risk_guardian" as const,
          label: "Risk Guardian",
          objective:
            "Inspect risky sessions, approvals, and account anomalies.",
          capabilities: ["risk-review", "session-analysis"],
        },
        {
          role: "ops_analyst" as const,
          label: "Ops Analyst",
          objective:
            "Review account operations context and summarize findings.",
          capabilities: ["dashboard-review", "reporting"],
        },
        {
          role: "comms_coordinator" as const,
          label: "Comms Coordinator",
          objective:
            "Prepare follow-up outreach once investigation is complete.",
          capabilities: ["connector-drafts", "operator-briefs"],
        },
      ],
      assignments: {},
    } satisfies WorkflowOrchestration;
  }

  if (
    role === "vendor" ||
    normalized.includes("purchase order") ||
    normalized.includes("shipment") ||
    normalized.includes("supplier")
  ) {
    return {
      enabled: true,
      coordinatorRole: "orchestrator" as const,
      strategy: "parallel_fanout" as const,
      summary:
        "Vendor orchestration fans out across supplier, logistics, and finance lanes before packaging the operating brief.",
      agents: [
        {
          role: "orchestrator" as const,
          label: "Orchestrator",
          objective:
            "Sequence vendor execution work and coordinate cross-lane handoffs.",
          capabilities: ["routing", "handoffs", "checkpointing"],
        },
        {
          role: "supplier_manager" as const,
          label: "Supplier Manager",
          objective:
            "Review purchase orders, constraints, and vendor-side follow-up actions.",
          capabilities: ["purchase-orders", "supplier-follow-up"],
        },
        {
          role: "logistics_coordinator" as const,
          label: "Logistics Coordinator",
          objective:
            "Inspect shipment state, ETA risk, and freight exceptions.",
          capabilities: ["freight", "shipment-tracking"],
        },
        {
          role: "finance_analyst" as const,
          label: "Finance Analyst",
          objective: "Review invoice exposure and payment dependencies.",
          capabilities: ["invoice-review", "payables"],
        },
        {
          role: "document_specialist" as const,
          label: "Document Specialist",
          objective:
            "Package the final operating brief and supporting artifacts.",
          capabilities: ["report-generation", "documentation"],
        },
      ],
      assignments: {},
    } satisfies WorkflowOrchestration;
  }

  return {
    enabled: true,
    coordinatorRole: "orchestrator" as const,
    strategy: "parallel_fanout" as const,
    summary:
      "Customer orchestration splits the review across operations, finance, inventory, and documentation lanes before final handoff.",
    agents: [
      {
        role: "orchestrator" as const,
        label: "Orchestrator",
        objective:
          "Coordinate the review and keep each lane inside the AutoChain sandbox.",
        capabilities: ["routing", "handoffs", "checkpointing"],
      },
      {
        role: "ops_analyst" as const,
        label: "Ops Analyst",
        objective: "Review account and order activity for the current request.",
        capabilities: ["dashboard-review", "operations"],
      },
      {
        role: "finance_analyst" as const,
        label: "Finance Analyst",
        objective:
          "Inspect invoice or balance exposure for the current request.",
        capabilities: ["invoice-review", "finance"],
      },
      {
        role: "inventory_analyst" as const,
        label: "Inventory Analyst",
        objective:
          "Review stock, catalog, or reorder implications for the request.",
        capabilities: ["inventory", "catalog"],
      },
      {
        role: "document_specialist" as const,
        label: "Document Specialist",
        objective: "Package outputs into a reusable document or brief.",
        capabilities: ["report-generation", "documentation"],
      },
    ],
    assignments: {},
  } satisfies WorkflowOrchestration;
}

function toWorkflowStep(row: typeof workflowSteps.$inferSelect): WorkflowStep {
  const payload = parseJsonObject(row.payload);
  return {
    id: row.id,
    stepNumber: row.stepNumber,
    title: row.title,
    actionKey: row.actionKey,
    actionType: row.actionType,
    target: row.target ?? null,
    payload,
    status: row.status,
    requiresApproval: row.requiresApproval,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    lastError: row.lastError ?? null,
    checkpointData: parseJsonObject(row.checkpointData),
    agentRole: isWorkflowAgentRole(payload.agentRole)
      ? payload.agentRole
      : null,
    dependsOnStepNumbers: parseNumberArray(payload.dependsOnStepNumbers),
    parallelGroup:
      typeof payload.parallelGroup === "string" ? payload.parallelGroup : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWorkflowEvent(
  row: typeof workflowEvents.$inferSelect,
): WorkflowEvent {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId ?? null,
    eventType: row.eventType,
    message: row.message,
    data: parseJsonObject(row.data),
    createdAt: row.createdAt,
  };
}

function toWorkflowArtifact(
  row: typeof workflowArtifacts.$inferSelect,
): WorkflowArtifact {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId ?? null,
    kind: row.kind,
    title: row.title,
    path: row.path ?? null,
    data: parseJsonObject(row.data),
    createdAt: row.createdAt,
  };
}

function getRunOrchestration(
  steps: WorkflowStep[],
  artifacts: WorkflowArtifact[],
): WorkflowOrchestration | null {
  const manifest = artifacts.find(
    (artifact) => artifact.kind === "orchestration_manifest",
  );

  if (manifest) {
    const parsed = parseOrchestration(manifest.data);
    if (parsed) {
      return parsed;
    }
  }

  const assignedSteps = steps.filter((step) =>
    isWorkflowAgentRole(step.agentRole),
  );
  if (assignedSteps.length === 0) {
    return null;
  }

  const agentRoles = [
    ...new Set(
      assignedSteps
        .map((step) => step.agentRole)
        .filter((role): role is WorkflowAgentRole => isWorkflowAgentRole(role)),
    ),
  ];
  const assignments = Object.fromEntries(
    assignedSteps
      .filter((step) => step.agentRole)
      .map((step) => [step.actionKey, step.agentRole!]),
  );
  const strategy = assignedSteps.some((step) => step.parallelGroup)
    ? "parallel_fanout"
    : "serial_handoff";

  return {
    enabled: true,
    coordinatorRole: "orchestrator",
    strategy,
    summary:
      "Derived orchestration metadata based on the current workflow step assignments.",
    agents: agentRoles.map((role) => ({
      role,
      label: role.replaceAll("_", " "),
      objective:
        "Coordinate the assigned sandbox steps for this workflow lane.",
      capabilities: [],
    })),
    assignments,
  };
}

function buildStepsForTask(input: {
  task: string;
  role: "customer" | "vendor" | "admin";
  actionKeys?: string[];
  orchestration?: WorkflowOrchestration | null;
}): WorkflowDraft {
  const normalized = input.task.toLowerCase();
  const refersToInvoices =
    normalized.includes("invoice") || normalized.includes("invoices");
  const refersToUnpaidInvoices =
    refersToInvoices &&
    (normalized.includes("overdue") ||
      normalized.includes("unpaid") ||
      normalized.includes("pending") ||
      normalized.includes("open") ||
      normalized.includes("outstanding"));
  const explicitActionKeys = input.actionKeys?.filter(Boolean) ?? [];
  const steps: PlannedStep[] = [];
  const restrictedActionKeys: string[] = [];
  const orchestration =
    input.orchestration ?? inferOrchestrationFromTask(input.task, input.role);

  const addAction = (
    actionKey: string,
    title: string,
    payload: Record<string, unknown> = {},
  ) => {
    const action = getSandboxAction(actionKey);
    if (!action) return;
    if (!action.roles.includes(input.role)) {
      restrictedActionKeys.push(actionKey);
      return;
    }

    steps.push({
      title,
      actionKey: action.key,
      actionType: action.actionType,
      target: action.route,
      payload: {
        ...getActionDefaultPayload(action.key, input.task),
        ...payload,
      },
      requiresApproval: action.requiresApproval,
      agentRole: null,
      dependsOnStepNumbers: [],
      parallelGroup: null,
    });
  };

  if (explicitActionKeys.length > 0) {
    explicitActionKeys.forEach((actionKey) => {
      const action = getSandboxAction(actionKey);
      if (!action) return;
      addAction(action.key, action.label);
    });

    return {
      steps: applyOrchestrationToSteps(steps, orchestration),
      restrictedActionKeys,
      orchestration,
    };
  }

  if (
    normalized.includes("monthly") ||
    normalized.includes("summary") ||
    normalized.includes("summarize")
  ) {
    addAction(
      input.role === "admin"
        ? "navigate.admin.dashboard"
        : input.role === "vendor"
          ? "navigate.vendor.dashboard"
          : "navigate.dashboard",
      "Open the relevant dashboard for summary context",
    );
    addAction(
      input.role === "vendor"
        ? "report.vendor_monthly"
        : "report.generate_monthly",
      "Generate the monthly summary document",
      {
        documentKind: "report",
        template:
          input.role === "vendor" ? "vendor_monthly" : "monthly_summary",
      },
    );
  }

  if (refersToUnpaidInvoices) {
    addAction(
      input.role === "admin"
        ? "navigate.admin.dashboard"
        : input.role === "vendor"
          ? "navigate.vendor.invoices"
          : "navigate.invoices",
      input.role === "admin"
        ? "Open the finance context from the admin dashboard"
        : input.role === "vendor"
          ? "Open the vendor invoice workspace"
          : "Open the invoices workspace",
    );
    addAction(
      input.role === "vendor"
        ? "report.vendor_invoice_review"
        : "report.check_overdue_invoices",
      input.role === "vendor"
        ? "Generate a vendor invoice review"
        : "Generate an unpaid invoice review",
      {
        documentKind: input.role === "vendor" ? "report" : "invoice",
        template:
          input.role === "vendor"
            ? "vendor_invoice_review"
            : "overdue_invoices",
      },
    );
  }

  if (normalized.includes("agreement") || normalized.includes("contract")) {
    addAction("navigate.documents", "Open the document studio");
    addAction("document.generate_agreement", "Generate an agreement draft", {
      documentKind: "agreement",
      template: "agreement",
    });
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("reorder") ||
    (input.role === "vendor" &&
      (normalized.includes("catalog") ||
        normalized.includes("constrained") ||
        normalized.includes("constraint")))
  ) {
    addAction(
      input.role === "vendor" ? "navigate.vendor.catalog" : "navigate.products",
      input.role === "vendor"
        ? "Open the vendor catalog"
        : "Open the product catalog",
    );
    addAction(
      input.role === "vendor"
        ? "report.vendor_catalog_health"
        : "report.inventory_reorder",
      input.role === "vendor"
        ? "Generate vendor catalog availability and constraint review"
        : "Generate inventory and reorder suggestions",
      {
        documentKind: "report",
        template:
          input.role === "vendor"
            ? "vendor_catalog_health"
            : "inventory_reorder",
      },
    );
  }

  if (
    input.role === "vendor" &&
    (normalized.includes("purchase order") ||
      normalized.includes("purchase orders") ||
      normalized.includes("po ") ||
      normalized.includes("procurement") ||
      normalized.includes("shipment") ||
      normalized.includes("lead time"))
  ) {
    addAction(
      "navigate.vendor.purchase-orders",
      "Open the vendor purchase orders workspace",
    );
    addAction(
      "report.vendor_monthly",
      "Generate a purchase order and shipment operations brief",
      {
        documentKind: "report",
        template: "vendor_purchase_orders",
      },
    );
  }

  if (input.role === "admin" && normalized.includes("risk")) {
    addAction("navigate.admin.sessions", "Open risky session review");
    addAction("report.customer_risk", "Generate the customer risk report", {
      documentKind: "report",
      template: "customer_risk",
    });
  }

  if (normalized.includes("disable")) {
    addAction("navigate.admin.users", "Open user management");
    addAction("user.disable", "Disable the selected user account", {
      targetRequired: true,
    });
  }

  if (
    normalized.includes("session revoke") ||
    normalized.includes("revoke session") ||
    normalized.includes("revoke the session") ||
    normalized.includes("terminate session") ||
    (normalized.includes("revoke") && normalized.includes("session"))
  ) {
    addAction("navigate.admin.sessions", "Open session management");
    addAction("session.revoke", "Revoke the selected session", {
      targetRequired: true,
    });
  }

  if (input.role === "admin" && normalized.includes("gmail")) {
    addAction("connector.gmail.compose", "Prepare a Gmail draft");
  }

  if (steps.length === 0) {
    if (restrictedActionKeys.length > 0) {
      return { steps, restrictedActionKeys, orchestration };
    }

    addAction(
      input.role === "admin"
        ? "navigate.admin.dashboard"
        : input.role === "vendor"
          ? "navigate.vendor.dashboard"
          : "navigate.dashboard",
      "Open the starting workspace",
    );
    addAction(
      input.role === "vendor"
        ? "report.vendor_monthly"
        : "report.generate_monthly",
      "Generate a reusable operational brief",
      {
        documentKind: "brief",
        template:
          input.role === "vendor" ? "vendor_general_brief" : "general_brief",
      },
    );
  }

  return {
    steps: applyOrchestrationToSteps(steps, orchestration),
    restrictedActionKeys,
    orchestration,
  };
}

function dependenciesSatisfied(step: WorkflowStep, steps: WorkflowStep[]) {
  if (!step.dependsOnStepNumbers || step.dependsOnStepNumbers.length === 0) {
    return true;
  }

  const stepsByNumber = new Map(
    steps.map((candidate) => [candidate.stepNumber, candidate]),
  );
  return step.dependsOnStepNumbers.every((stepNumber) => {
    const dependency = stepsByNumber.get(stepNumber);
    return (
      dependency?.status === "completed" || dependency?.status === "skipped"
    );
  });
}

function getReadySteps(steps: WorkflowStep[]) {
  return steps.filter(
    (step) =>
      ["pending", "approved"].includes(step.status) &&
      dependenciesSatisfied(step, steps),
  );
}

function getNextExecutableStep(steps: WorkflowStep[]) {
  return getReadySteps(steps)[0];
}

function getRunStatus(
  run: typeof workflowRuns.$inferSelect,
  steps: WorkflowStep[],
): WorkflowRun["status"] {
  if (run.expiresAt <= new Date().toISOString()) return "expired";
  if (run.status === "cancelled") return "cancelled";
  if (
    steps.every(
      (step) => step.status === "completed" || step.status === "skipped",
    )
  ) {
    return "completed";
  }
  if (
    run.status === "failed" ||
    steps.some((step) => step.status === "failed")
  ) {
    return "failed";
  }
  if (steps.some((step) => step.status === "running")) return "running";

  const nextStep = getNextExecutableStep(steps);
  if (!nextStep) {
    const unfinishedSteps = steps.filter(
      (step) => !["completed", "skipped", "cancelled"].includes(step.status),
    );
    return unfinishedSteps.length === 0 ? "completed" : run.status;
  }
  if (nextStep.requiresApproval && nextStep.status === "pending") {
    return "waiting_approval";
  }

  return run.status === "running" ? "running" : "planned";
}

async function addEvent(
  db: Db,
  runId: number,
  stepId: number | null,
  eventType: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  db.insert(workflowEvents)
    .values({
      runId,
      stepId,
      eventType,
      message,
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    })
    .run();
}

async function addCheckpoint(
  db: Db,
  runId: number,
  stepId: number | null,
  checkpointKey: string,
  data: Record<string, unknown>,
) {
  db.insert(workflowCheckpoints)
    .values({
      runId,
      stepId,
      checkpointKey,
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    })
    .run();
}

async function addArtifact(
  db: Db,
  runId: number,
  stepId: number | null,
  kind: string,
  title: string,
  data: Record<string, unknown>,
) {
  const path = await persistWorkflowArtifact(runId, title, data);
  db.insert(workflowArtifacts)
    .values({
      runId,
      stepId,
      kind,
      title,
      path,
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function listAllowedActions(role: "customer" | "vendor" | "admin") {
  return getAllowedSandboxActions(role);
}

export async function createWorkflowRun(input: {
  db: Db;
  customerId: number;
  userId: number;
  role: "customer" | "vendor" | "admin";
  sessionId: number | null;
  mode: "text" | "voice" | "video" | "agentic";
  autonomy: "manual" | "ask" | "agent";
  task: string;
  actionKeys?: string[];
  orchestration?: WorkflowOrchestration | null;
}) {
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + WORKFLOW_TIMEOUT_SECONDS * 1000,
  ).toISOString();
  const draft = buildStepsForTask({
    task: input.task,
    role: input.role,
    actionKeys: input.actionKeys,
    orchestration: input.orchestration,
  });
  const plannedSteps = draft.steps;

  if (plannedSteps.length === 0 && draft.restrictedActionKeys.length > 0) {
    return {
      error:
        "This task requires permissions that are not available for your role",
    } as const;
  }

  if (plannedSteps.length === 0) {
    return {
      error: "Workflow could not be planned from the requested actions",
    } as const;
  }

  const [run] = input.db
    .insert(workflowRuns)
    .values({
      customerId: input.customerId,
      userId: input.userId,
      role: input.role,
      sessionId: input.sessionId,
      mode: input.mode,
      autonomy: input.autonomy,
      sandbox: "app",
      task: input.task,
      status: "planned",
      currentStepIndex: 0,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .all();

  input.db
    .insert(workflowSteps)
    .values(
      plannedSteps.map((step, index) => ({
        runId: run!.id,
        stepNumber: index + 1,
        title: step.title,
        actionKey: step.actionKey,
        actionType: step.actionType,
        target: step.target,
        payload: JSON.stringify({
          ...step.payload,
          agentRole: step.agentRole,
          dependsOnStepNumbers: step.dependsOnStepNumbers,
          parallelGroup: step.parallelGroup,
        }),
        status: "pending" as const,
        requiresApproval: step.requiresApproval,
        retryCount: 0,
        maxRetries: 2,
        checkpointData: JSON.stringify({}),
        createdAt: now,
        updatedAt: now,
      })) satisfies Array<typeof workflowSteps.$inferInsert>,
    )
    .run();

  await addEvent(
    input.db,
    run!.id,
    null,
    "workflow.created",
    "Workflow created from task",
    {
      task: input.task,
      stepCount: plannedSteps.length,
      sandbox: "app",
      orchestration: draft.orchestration,
    },
  );

  if (draft.orchestration) {
    await addArtifact(
      input.db,
      run!.id,
      null,
      "orchestration_manifest",
      "Agent Orchestration",
      draft.orchestration,
    );
  }

  if (draft.restrictedActionKeys.length > 0) {
    await addEvent(
      input.db,
      run!.id,
      null,
      "workflow.restricted_actions_filtered",
      "Restricted actions were removed from this workflow plan",
      {
        restrictedActionKeys: draft.restrictedActionKeys,
      },
    );
  }

  return getWorkflowRunById(input.db, run!.id, input.role, input.userId);
}

export function getWorkflowRunById(
  db: Db,
  runId: number,
  role: "customer" | "vendor" | "admin",
  userId: number,
) {
  const run = db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .get();

  if (!run) return null;
  if (role !== "admin" && run.userId !== userId) return null;

  const steps = db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, runId))
    .orderBy(workflowSteps.stepNumber)
    .all()
    .map(toWorkflowStep);
  const events = db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.runId, runId))
    .orderBy(desc(workflowEvents.createdAt))
    .all()
    .map(toWorkflowEvent);
  const artifacts = db
    .select()
    .from(workflowArtifacts)
    .where(eq(workflowArtifacts.runId, runId))
    .orderBy(desc(workflowArtifacts.createdAt))
    .all()
    .map(toWorkflowArtifact);
  const orchestration = getRunOrchestration(steps, artifacts);

  return {
    id: run.id,
    customerId: run.customerId,
    userId: run.userId,
    role: run.role,
    sessionId: run.sessionId ?? null,
    mode: run.mode,
    autonomy: run.autonomy,
    sandbox: "app" as const,
    task: run.task,
    status: getRunStatus(run, steps),
    currentStepIndex: run.currentStepIndex,
    retryCount: run.retryCount,
    maxRetries: run.maxRetries,
    lastError: run.lastError ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    expiresAt: run.expiresAt,
    orchestration,
    steps,
    events,
    artifacts,
  };
}

export function listWorkflowRuns(
  db: Db,
  role: "customer" | "vendor" | "admin",
  userId: number,
  customerId: number,
) {
  const runs = db
    .select()
    .from(workflowRuns)
    .orderBy(desc(workflowRuns.createdAt))
    .all()
    .filter((run) => (role === "admin" ? true : run.userId === userId))
    .filter((run) => (role === "admin" ? true : run.customerId === customerId));

  return runs
    .map((run) => getWorkflowRunById(db, run.id, role, userId))
    .filter((run): run is NonNullable<typeof run> => Boolean(run));
}

export async function approveWorkflowRun(
  db: Db,
  runId: number,
  role: "customer" | "vendor" | "admin",
  userId: number,
) {
  const run = getWorkflowRunById(db, runId, role, userId);
  if (!run) return null;

  const writeSteps = run.steps.filter(
    (step) =>
      step.requiresApproval &&
      (step.actionType === "mutate" || step.actionType === "connector"),
  );

  if (writeSteps.length > 0 && role !== "admin") {
    return { error: "Your role cannot approve write actions in agentic mode" };
  }

  db.update(workflowRuns)
    .set({ status: "running", updatedAt: new Date().toISOString() })
    .where(eq(workflowRuns.id, runId))
    .run();
  db.update(workflowSteps)
    .set({ status: "approved", updatedAt: new Date().toISOString() })
    .where(eq(workflowSteps.runId, runId))
    .run();

  await addEvent(db, runId, null, "workflow.approved", "Workflow approved");
  return getWorkflowRunById(db, runId, role, userId);
}

export async function cancelWorkflowRun(
  db: Db,
  runId: number,
  role: "customer" | "vendor" | "admin",
  userId: number,
) {
  const run = getWorkflowRunById(db, runId, role, userId);
  if (!run) return null;

  db.update(workflowRuns)
    .set({
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowRuns.id, runId))
    .run();
  db.update(workflowSteps)
    .set({
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowSteps.runId, runId))
    .run();

  await addEvent(db, runId, null, "workflow.cancelled", "Workflow cancelled");
  return getWorkflowRunById(db, runId, role, userId);
}

function formatStepMessage(prefix: string, step: WorkflowStep) {
  const actor = step.agentRole
    ? ` (${step.agentRole.replaceAll("_", " ")})`
    : "";
  return `${prefix}${actor}: ${step.title}`;
}

function getStepBatch(readySteps: WorkflowStep[]) {
  const [first] = readySteps;
  if (!first) {
    return [];
  }

  if (!first.parallelGroup || first.actionType === "navigate") {
    return [first];
  }

  const batch = readySteps.filter(
    (step) =>
      step.parallelGroup === first.parallelGroup &&
      step.actionType !== "navigate" &&
      step.requiresApproval === first.requiresApproval,
  );

  return batch.length > 0 ? batch : [first];
}

async function executeQueryStep(db: Db, run: WorkflowRun, step: WorkflowStep) {
  if (step.actionKey === "session.review_risky") {
    const now = new Date().toISOString();
    const riskySessions = db
      .select()
      .from(userSessions)
      .where(eq(userSessions.customerId, run.customerId))
      .all()
      .filter((session) => !session.revokedAt && session.expiresAt > now)
      .filter(
        (session) => session.autonomy === "agent" || session.mode === "agentic",
      );

    const data = {
      riskySessionCount: riskySessions.length,
      sessions: riskySessions.map((session) => ({
        id: session.id,
        mode: session.mode,
        autonomy: session.autonomy,
        lastSeenAt: session.lastSeenAt,
      })),
    };
    await addArtifact(db, run.id, step.id, "query_result", step.title, data);
    return data;
  }

  return { ok: true };
}

async function executeGenerateStep(
  db: Db,
  run: WorkflowRun,
  step: WorkflowStep,
) {
  const payload = step.payload;
  const kind =
    (payload.documentKind as "report" | "invoice" | "agreement" | "brief") ??
    "brief";
  const template = (payload.template as string | undefined) ?? step.actionKey;
  const title =
    template === "monthly_summary"
      ? "Monthly Summary"
      : template === "vendor_monthly"
        ? "Vendor Operations Summary"
        : template === "vendor_purchase_orders"
          ? "Purchase Order + Shipment Brief"
          : template === "overdue_invoices"
            ? "Overdue Invoice Review"
            : template === "vendor_invoice_review"
              ? "Vendor Invoice Review"
              : template === "inventory_reorder"
                ? "Inventory + Reorder Suggestions"
                : template === "vendor_catalog_health"
                  ? "Vendor Catalog Health Report"
                  : template === "customer_risk"
                    ? "Top Customer Risk Report"
                    : template === "agreement"
                      ? "Agreement Draft"
                      : "Operational Brief";

  const { document, version } = await createGeneratedDocument({
    db,
    customerId: run.customerId,
    ownerUserId: run.userId,
    kind,
    title,
    prompt: run.task,
  });

  const artifactData = {
    documentId: document.id,
    versionId: version.id,
    title: version.title,
    filePath: version.filePath,
  };
  await addArtifact(db, run.id, step.id, "document", title, artifactData);
  await addCheckpoint(db, run.id, step.id, "document.generated", artifactData);
  return artifactData;
}

async function markStepStatus(
  db: Db,
  stepId: number,
  status: WorkflowStep["status"],
  changes: Partial<typeof workflowSteps.$inferInsert> = {},
) {
  db.update(workflowSteps)
    .set({
      status,
      updatedAt: new Date().toISOString(),
      ...changes,
    })
    .where(eq(workflowSteps.id, stepId))
    .run();
}

async function executeWorkflowStep(
  db: Db,
  run: WorkflowRun,
  step: WorkflowStep,
) {
  await markStepStatus(db, step.id, "running");
  await addEvent(
    db,
    run.id,
    step.id,
    "step.started",
    formatStepMessage("Started", step),
    {
      agentRole: step.agentRole,
      parallelGroup: step.parallelGroup,
    },
  );

  let clientAction: {
    type: "navigate";
    href: string;
    dataAgentId: string;
  } | null = null;

  if (step.actionType === "navigate") {
    const action = getSandboxAction(step.actionKey);
    clientAction = {
      type: "navigate",
      href: step.target ?? action?.route ?? "/dashboard",
      dataAgentId: action?.dataAgentId ?? "nav-unknown",
    };
    await addCheckpoint(db, run.id, step.id, "navigation.completed", {
      href: clientAction.href,
    });
  } else if (step.actionType === "query") {
    await executeQueryStep(db, run, step);
  } else if (step.actionType === "generate") {
    await executeGenerateStep(db, run, step);
  } else if (step.actionType === "connector") {
    await addArtifact(db, run.id, step.id, "connector", step.title, {
      provider: "gmail",
      status: "not_connected",
      message: "Connector account is required before running this step.",
    });
  } else {
    throw new Error(
      "This workflow step requires additional target selection before it can run.",
    );
  }

  await markStepStatus(db, step.id, "completed", {
    lastError: null,
    checkpointData: JSON.stringify({
      completedAt: new Date().toISOString(),
      agentRole: step.agentRole,
      parallelGroup: step.parallelGroup,
    }),
  });
  db.update(workflowRuns)
    .set({
      status: "running",
      currentStepIndex: step.stepNumber,
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowRuns.id, run.id))
    .run();

  await addEvent(
    db,
    run.id,
    step.id,
    "step.completed",
    formatStepMessage("Completed", step),
    {
      agentRole: step.agentRole,
      parallelGroup: step.parallelGroup,
    },
  );

  return { clientAction };
}

export async function runNextWorkflowStep(
  db: Db,
  runId: number,
  role: "customer" | "vendor" | "admin",
  userId: number,
) {
  const run = getWorkflowRunById(db, runId, role, userId);
  if (!run) return { error: "Workflow not found" };
  if (run.status === "cancelled")
    return { error: "Workflow has been cancelled" };
  if (run.status === "expired") return { error: "Workflow expired" };

  const readySteps = getReadySteps(run.steps);
  const nextStep = readySteps[0];

  if (!nextStep) {
    const unfinishedSteps = run.steps.filter(
      (step) => !["completed", "skipped", "cancelled"].includes(step.status),
    );

    if (unfinishedSteps.length > 0) {
      return {
        error:
          "No executable step is ready yet. Review orchestration dependencies or approvals.",
        run,
      };
    }

    db.update(workflowRuns)
      .set({ status: "completed", updatedAt: new Date().toISOString() })
      .where(eq(workflowRuns.id, runId))
      .run();
    await addEvent(db, runId, null, "workflow.completed", "Workflow completed");
    return { run: getWorkflowRunById(db, runId, role, userId) };
  }

  if (nextStep.requiresApproval && run.status !== "running") {
    db.update(workflowRuns)
      .set({ status: "waiting_approval", updatedAt: new Date().toISOString() })
      .where(eq(workflowRuns.id, runId))
      .run();
    await addEvent(
      db,
      runId,
      nextStep.id,
      "workflow.waiting_approval",
      "Workflow is waiting for approval before executing a side-effect step",
    );
    return {
      run: getWorkflowRunById(db, runId, role, userId),
      notice: "Workflow requires approval before executing this step",
    };
  }

  const batch = getStepBatch(readySteps);
  let activeStep = nextStep;

  try {
    let clientAction: {
      type: "navigate";
      href: string;
      dataAgentId: string;
    } | null = null;

    for (const step of batch) {
      activeStep = step;
      const result = await executeWorkflowStep(db, run, step);
      if (!clientAction && result.clientAction) {
        clientAction = result.clientAction;
      }
    }

    if (batch.length > 1) {
      await addEvent(
        db,
        runId,
        null,
        "workflow.parallel_batch.completed",
        `Completed ${batch.length} orchestrated steps in parallel lane ${batch[0]!.parallelGroup ?? "default"}`,
        {
          parallelGroup: batch[0]!.parallelGroup,
          stepIds: batch.map((step) => step.id),
          agentRoles: batch
            .map((step) => step.agentRole)
            .filter((value): value is WorkflowAgentRole => Boolean(value)),
        },
      );
    }

    const updatedRun = getWorkflowRunById(db, runId, role, userId);
    if (
      updatedRun &&
      updatedRun.steps.every(
        (step) => step.status === "completed" || step.status === "skipped",
      )
    ) {
      db.update(workflowRuns)
        .set({ status: "completed", updatedAt: new Date().toISOString() })
        .where(eq(workflowRuns.id, runId))
        .run();
    }

    return {
      run: getWorkflowRunById(db, runId, role, userId),
      clientAction,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Step failed";
    await markStepStatus(db, activeStep.id, "failed", {
      lastError: message,
      retryCount: activeStep.retryCount + 1,
    });
    db.update(workflowRuns)
      .set({
        status: "failed",
        retryCount: run.retryCount + 1,
        lastError: message,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowRuns.id, runId))
      .run();

    await addEvent(db, runId, activeStep.id, "step.failed", message, {
      retryCount: activeStep.retryCount + 1,
      agentRole: activeStep.agentRole,
    });

    return {
      error: message,
      run: getWorkflowRunById(db, runId, role, userId),
    };
  }
}

export async function retryWorkflowRun(
  db: Db,
  runId: number,
  role: "customer" | "vendor" | "admin",
  userId: number,
) {
  const run = getWorkflowRunById(db, runId, role, userId);
  if (!run) return null;

  const failedStep = run.steps.find((step) => step.status === "failed");
  if (!failedStep) {
    return { error: "No failed step is available for retry" };
  }
  if (failedStep.retryCount >= failedStep.maxRetries) {
    return { error: "Retry limit reached for the failed step" };
  }

  await markStepStatus(
    db,
    failedStep.id,
    failedStep.requiresApproval ? "approved" : "pending",
    {
      lastError: null,
    },
  );
  db.update(workflowRuns)
    .set({
      status: failedStep.requiresApproval ? "running" : "planned",
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowRuns.id, runId))
    .run();

  await addEvent(
    db,
    runId,
    failedStep.id,
    "step.retried",
    `Retry scheduled for: ${failedStep.title}`,
  );

  return getWorkflowRunById(db, runId, role, userId);
}
