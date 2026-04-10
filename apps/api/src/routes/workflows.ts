import type { FastifyPluginAsync } from "fastify";
import { CreateWorkflowRunRequest } from "@autochain/shared";
import { getUser, requireAuth, writeAuditLog } from "../middleware/auth.js";
import {
  approveWorkflowRun,
  cancelWorkflowRun,
  createWorkflowRun,
  getWorkflowRunById,
  listAllowedActions,
  listWorkflowRuns,
  retryWorkflowRun,
  runNextWorkflowStep,
} from "../lib/workflow-runtime.js";

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request) => {
    const auth = getUser(request);
    return {
      success: true,
      data: listWorkflowRuns(app.db, auth.role, auth.userId, auth.customerId),
      error: null,
    };
  });

  app.get("/actions", async (request) => {
    const auth = getUser(request);
    return {
      success: true,
      data: listAllowedActions(auth.role),
      error: null,
    };
  });

  app.post("/", async (request, reply) => {
    const auth = getUser(request);
    const parsed = CreateWorkflowRunRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Invalid workflow payload",
      });
    }

    const run = await createWorkflowRun({
      db: app.db,
      customerId: auth.customerId,
      userId: auth.userId,
      role: auth.role,
      sessionId: auth.sessionId,
      mode: auth.mode,
      autonomy: auth.autonomy,
      task: parsed.data.task,
      actionKeys: parsed.data.actionKeys,
      orchestration: parsed.data.orchestration ?? null,
    });

    if (!run) {
      return reply.status(500).send({
        success: false,
        data: null,
        error: "Workflow could not be created",
      });
    }
    if ("error" in run) {
      return reply
        .status(403)
        .send({ success: false, data: null, error: run.error });
    }

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "workflow.create",
      entityType: "workflow_run",
      entityId: String(run.id),
      details: {
        task: parsed.data.task,
        stepCount: run.steps.length,
        actionKeyCount: parsed.data.actionKeys?.length ?? 0,
        orchestration: parsed.data.orchestration ?? null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: run,
      error: null,
    });
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const auth = getUser(request);
    const run = getWorkflowRunById(
      app.db,
      Number(request.params.id),
      auth.role,
      auth.userId,
    );

    if (!run) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Workflow not found" });
    }

    return {
      success: true,
      data: run,
      error: null,
    };
  });

  app.post<{ Params: { id: string } }>(
    "/:id/approve",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await approveWorkflowRun(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!result) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "Workflow not found" });
      }
      if ("error" in result) {
        return reply
          .status(403)
          .send({ success: false, data: null, error: result.error });
      }

      writeAuditLog(app.db, {
        actorUserId: auth.userId,
        actorRole: auth.role,
        customerId: auth.customerId,
        sessionId: auth.sessionId,
        action: "workflow.approve",
        entityType: "workflow_run",
        entityId: String(result.id),
      });

      return {
        success: true,
        data: result,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/cancel",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await cancelWorkflowRun(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!result) {
        return reply
          .status(404)
          .send({ success: false, data: null, error: "Workflow not found" });
      }

      writeAuditLog(app.db, {
        actorUserId: auth.userId,
        actorRole: auth.role,
        customerId: auth.customerId,
        sessionId: auth.sessionId,
        action: "workflow.cancel",
        entityType: "workflow_run",
        entityId: String(result.id),
        outcome: "cancelled",
      });

      return {
        success: true,
        data: result,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/run-next",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await runNextWorkflowStep(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if ("error" in result && !result.run) {
        return reply
          .status(400)
          .send({ success: false, data: null, error: result.error });
      }

      if (result.run) {
        writeAuditLog(app.db, {
          actorUserId: auth.userId,
          actorRole: auth.role,
          customerId: auth.customerId,
          sessionId: auth.sessionId,
          action: "workflow.run_next",
          entityType: "workflow_run",
          entityId: String(result.run.id),
          details: {
            error: result.error ?? null,
            notice: "notice" in result ? (result.notice ?? null) : null,
            clientAction: result.clientAction ?? null,
          },
          outcome: result.error ? "failed" : "success",
        });
      }

      return {
        success: true,
        data: result.run ?? null,
        clientAction: result.clientAction ?? null,
        notice: "notice" in result ? (result.notice ?? null) : null,
        error: result.error ?? null,
      };
    },
  );

  app.post<{ Params: { id: string } }>("/:id/retry", async (request, reply) => {
    const auth = getUser(request);
    const result = await retryWorkflowRun(
      app.db,
      Number(request.params.id),
      auth.role,
      auth.userId,
    );

    if (!result) {
      return reply
        .status(404)
        .send({ success: false, data: null, error: "Workflow not found" });
    }
    if ("error" in result) {
      return reply
        .status(400)
        .send({ success: false, data: null, error: result.error });
    }

    return {
      success: true,
      data: result,
      error: null,
    };
  });
};
