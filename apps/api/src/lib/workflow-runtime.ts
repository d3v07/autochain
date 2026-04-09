import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@autochain/db";
import {
  customers,
  invoices,
  workflowArtifacts,
  workflowCheckpoints,
  workflowEvents,
  workflowRuns,
  workflowSteps,
  userSessions,
} from "@autochain/db";
import type {
  SandboxAction,
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

type PlannedStep = {
  title: string;
  actionKey: string;
  actionType: SandboxAction["actionType"];
  target: string | null;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
};

type WorkflowDraft = {
  steps: PlannedStep[];
  restrictedActionKeys: string[];
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

function toWorkflowStep(row: typeof workflowSteps.$inferSelect): WorkflowStep {
  return {
    id: row.id,
    stepNumber: row.stepNumber,
    title: row.title,
    actionKey: row.actionKey,
    actionType: row.actionType,
    target: row.target ?? null,
    payload: parseJsonObject(row.payload),
    status: row.status,
    requiresApproval: row.requiresApproval,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    lastError: row.lastError ?? null,
    checkpointData: parseJsonObject(row.checkpointData),
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

function buildStepsForTask(
  task: string,
  role: "customer" | "vendor" | "admin",
): WorkflowDraft {
  const normalized = task.toLowerCase();
  const refersToInvoices =
    normalized.includes("invoice") || normalized.includes("invoices");
  const refersToUnpaidInvoices =
    refersToInvoices &&
    (normalized.includes("overdue") ||
      normalized.includes("unpaid") ||
      normalized.includes("pending") ||
      normalized.includes("open") ||
      normalized.includes("outstanding"));
  const steps: PlannedStep[] = [];
  const restrictedActionKeys: string[] = [];

  const addAction = (
    actionKey: string,
    title: string,
    payload: Record<string, unknown> = {},
  ) => {
    const action = getSandboxAction(actionKey);
    if (!action) return;
    if (!action.roles.includes(role)) {
      restrictedActionKeys.push(actionKey);
      return;
    }

    steps.push({
      title,
      actionKey: action.key,
      actionType: action.actionType,
      target: action.route,
      payload,
      requiresApproval: action.requiresApproval,
    });
  };

  if (
    normalized.includes("monthly") ||
    normalized.includes("summary") ||
    normalized.includes("summarize")
  ) {
    addAction(
      role === "admin"
        ? "navigate.admin.dashboard"
        : role === "vendor"
          ? "navigate.vendor.dashboard"
          : "navigate.dashboard",
      "Open the relevant dashboard for summary context",
    );
    addAction(
      role === "vendor" ? "report.vendor_monthly" : "report.generate_monthly",
      "Generate the monthly summary document",
      {
        documentKind: "report",
        template: role === "vendor" ? "vendor_monthly" : "monthly_summary",
        task,
      },
    );
  }

  if (refersToUnpaidInvoices) {
    addAction(
      role === "admin"
        ? "navigate.admin.dashboard"
        : role === "vendor"
          ? "navigate.vendor.invoices"
          : "navigate.invoices",
      role === "admin"
        ? "Open the finance context from the admin dashboard"
        : role === "vendor"
          ? "Open the vendor invoice workspace"
          : "Open the invoices workspace",
    );
    addAction(
      role === "vendor"
        ? "report.vendor_invoice_review"
        : "report.check_overdue_invoices",
      role === "vendor"
        ? "Generate a vendor invoice review"
        : "Generate an unpaid invoice review",
      {
        documentKind: role === "vendor" ? "report" : "invoice",
        template:
          role === "vendor" ? "vendor_invoice_review" : "overdue_invoices",
        task,
      },
    );
  }

  if (normalized.includes("agreement") || normalized.includes("contract")) {
    addAction("navigate.documents", "Open the document studio");
    addAction("document.generate_agreement", "Generate an agreement draft", {
      documentKind: "agreement",
      template: "agreement",
      task,
    });
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("reorder") ||
    (role === "vendor" &&
      (normalized.includes("catalog") ||
        normalized.includes("constrained") ||
        normalized.includes("constraint")))
  ) {
    addAction(
      role === "vendor" ? "navigate.vendor.catalog" : "navigate.products",
      role === "vendor"
        ? "Open the vendor catalog"
        : "Open the product catalog",
    );
    addAction(
      role === "vendor"
        ? "report.vendor_catalog_health"
        : "report.inventory_reorder",
      role === "vendor"
        ? "Generate vendor catalog availability and constraint review"
        : "Generate inventory and reorder suggestions",
      {
        documentKind: "report",
        template:
          role === "vendor" ? "vendor_catalog_health" : "inventory_reorder",
        task,
      },
    );
  }

  if (
    role === "vendor" &&
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
        task,
      },
    );
  }

  if (role === "admin" && normalized.includes("risk")) {
    addAction("navigate.admin.sessions", "Open risky session review");
    addAction("report.customer_risk", "Generate the customer risk report", {
      documentKind: "report",
      template: "customer_risk",
      task,
    });
  }

  if (normalized.includes("disable")) {
    addAction("navigate.admin.users", "Open user management");
    addAction("user.disable", "Disable the selected user account", {
      task,
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
      task,
      targetRequired: true,
    });
  }

  if (role === "admin" && normalized.includes("gmail")) {
    addAction("connector.gmail.compose", "Prepare a Gmail draft", {
      provider: "gmail",
      task,
    });
  }

  if (steps.length === 0) {
    if (restrictedActionKeys.length > 0) {
      return { steps, restrictedActionKeys };
    }

    addAction(
      role === "admin"
        ? "navigate.admin.dashboard"
        : role === "vendor"
          ? "navigate.vendor.dashboard"
          : "navigate.dashboard",
      "Open the starting workspace",
    );
    addAction(
      role === "vendor" ? "report.vendor_monthly" : "report.generate_monthly",
      "Generate a reusable operational brief",
      {
        documentKind: "brief",
        template: role === "vendor" ? "vendor_general_brief" : "general_brief",
        task,
      },
    );
  }

  return { steps, restrictedActionKeys };
}

function getNextExecutableStep(steps: WorkflowStep[]) {
  return steps.find((step) => ["pending", "approved"].includes(step.status));
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
    return "completed";
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
}) {
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + WORKFLOW_TIMEOUT_SECONDS * 1000,
  ).toISOString();
  const draft = buildStepsForTask(input.task, input.role);
  const plannedSteps = draft.steps;

  if (plannedSteps.length === 0 && draft.restrictedActionKeys.length > 0) {
    return {
      error:
        "This task requires permissions that are not available for your role",
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
        payload: JSON.stringify(step.payload),
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
    },
  );

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

  const nextStep = run.steps.find((step) =>
    ["pending", "approved"].includes(step.status),
  );

  if (!nextStep) {
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

  await markStepStatus(db, nextStep.id, "running");
  await addEvent(
    db,
    runId,
    nextStep.id,
    "step.started",
    `Started: ${nextStep.title}`,
  );

  try {
    let clientAction: {
      type: "navigate";
      href: string;
      dataAgentId: string;
    } | null = null;
    if (nextStep.actionType === "navigate") {
      const action = getSandboxAction(nextStep.actionKey);
      clientAction = {
        type: "navigate",
        href: nextStep.target ?? action?.route ?? "/dashboard",
        dataAgentId: action?.dataAgentId ?? "nav-unknown",
      };
      await addCheckpoint(db, runId, nextStep.id, "navigation.completed", {
        href: clientAction.href,
      });
    } else if (nextStep.actionType === "query") {
      await executeQueryStep(db, run, nextStep);
    } else if (nextStep.actionType === "generate") {
      await executeGenerateStep(db, run, nextStep);
    } else if (nextStep.actionType === "connector") {
      await addArtifact(db, runId, nextStep.id, "connector", nextStep.title, {
        provider: "gmail",
        status: "not_connected",
        message: "Connector account is required before running this step.",
      });
    } else {
      throw new Error(
        "This workflow step requires additional target selection before it can run.",
      );
    }

    await markStepStatus(db, nextStep.id, "completed", {
      lastError: null,
      checkpointData: JSON.stringify({ completedAt: new Date().toISOString() }),
    });
    db.update(workflowRuns)
      .set({
        status: "running",
        currentStepIndex: nextStep.stepNumber,
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflowRuns.id, runId))
      .run();

    await addEvent(
      db,
      runId,
      nextStep.id,
      "step.completed",
      `Completed: ${nextStep.title}`,
    );

    const updatedRun = getWorkflowRunById(db, runId, role, userId);
    if (
      updatedRun &&
      updatedRun.steps.every((step) => step.status === "completed")
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
    await markStepStatus(db, nextStep.id, "failed", {
      lastError: message,
      retryCount: nextStep.retryCount + 1,
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

    await addEvent(db, runId, nextStep.id, "step.failed", message, {
      retryCount: nextStep.retryCount + 1,
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
