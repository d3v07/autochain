import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { userSessions } from "@autochain/db";
import {
  AddAssistantEntryRequest,
  CreateAssistantSessionRequest,
  SessionDocumentRequest,
  SessionWorkflowRequest,
  UpdateAiStateRequest,
  VisualContextRequest,
  VoiceTurnRequest,
} from "@autochain/shared";
import { getUser, requireAuth, writeAuditLog } from "../middleware/auth.js";
import {
  AGENTIC_SAFETY_PROMPT,
  GLOBAL_SYSTEM_PROMPT,
  TASK_TEMPLATES,
  getAutonomyPrompt,
  getModePrompt,
  getRolePrompt,
} from "../lib/prompt-pack.js";
import {
  approveWorkflowRun,
  cancelWorkflowRun,
  createWorkflowRun,
  getWorkflowRunById,
  retryWorkflowRun,
  runNextWorkflowStep,
} from "../lib/workflow-runtime.js";
import {
  addAssistantEntry,
  buildAssistantWorkspaceOverview,
  closeAssistantSession,
  createAssistantSession,
  createDocumentFromAssistantSession,
  createWorkflowFromAssistantSession,
  getAssistantSessionById,
  handleVisualContext,
  handleVoiceTurn,
  listAssistantSessions,
} from "../lib/assistant-sessions.js";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/state", async (request) => {
    const auth = getUser(request);

    return {
      success: true,
      data: {
        role: auth.role,
        mode: auth.mode,
        autonomy: auth.autonomy,
        availableModes: auth.availableModes,
        availableAutonomy: auth.availableAutonomy,
        featureFlags: auth.featureFlags,
      },
      error: null,
    };
  });

  app.patch("/state", async (request, reply) => {
    const auth = getUser(request);
    const parsed = UpdateAiStateRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Invalid AI state payload",
      });
    }

    let requestedMode = parsed.data.mode ?? auth.mode;
    if (!auth.availableModes.includes(requestedMode)) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: `Mode '${requestedMode}' is not enabled for this session`,
      });
    }

    let requestedAutonomy = parsed.data.autonomy ?? auth.autonomy;
    if (parsed.data.autonomy === "manual" && requestedMode === "agentic") {
      requestedMode = "text";
    }
    if (parsed.data.mode === "agentic" && requestedAutonomy === "manual") {
      requestedAutonomy = "ask";
    }

    if (!auth.availableAutonomy.includes(requestedAutonomy)) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: `Autonomy '${requestedAutonomy}' is not enabled for this session`,
      });
    }

    const lastSeenAt = new Date().toISOString();
    const [updated] = app.db
      .update(userSessions)
      .set({
        mode: requestedMode,
        autonomy: requestedAutonomy,
        lastSeenAt,
      })
      .where(eq(userSessions.id, auth.sessionId))
      .returning()
      .all();

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "ai.state.update",
      entityType: "session",
      entityId: String(auth.sessionId),
      details: {
        from: { mode: auth.mode, autonomy: auth.autonomy },
        to: { mode: updated!.mode, autonomy: updated!.autonomy },
      },
    });

    return {
      success: true,
      data: {
        role: auth.role,
        mode: updated!.mode,
        autonomy: updated!.autonomy,
        availableModes: auth.availableModes,
        availableAutonomy: auth.availableAutonomy,
        featureFlags: auth.featureFlags,
      },
      error: null,
    };
  });

  app.get("/prompts", async (request) => {
    const auth = getUser(request);

    return {
      success: true,
      data: {
        globalSystemPrompt: GLOBAL_SYSTEM_PROMPT,
        rolePrompt: getRolePrompt(auth.role),
        modePrompt: `${getModePrompt(auth.mode)}\n${getAutonomyPrompt(auth.autonomy)}`,
        agenticSafetyPrompt: AGENTIC_SAFETY_PROMPT,
        taskTemplates: TASK_TEMPLATES,
      },
      error: null,
    };
  });

  app.get("/workspace", async (request) => {
    const auth = getUser(request);

    return {
      success: true,
      data: {
        role: auth.role,
        mode: auth.mode,
        autonomy: auth.autonomy,
        availableModes: auth.availableModes,
        availableAutonomy: auth.availableAutonomy,
        featureFlags: auth.featureFlags,
        overview: buildAssistantWorkspaceOverview({
          db: app.db,
          role: auth.role,
          userId: auth.userId,
          customerId: auth.customerId,
        }),
      },
      error: null,
    };
  });

  app.get("/approvals", async (request) => {
    const auth = getUser(request);
    const overview = buildAssistantWorkspaceOverview({
      db: app.db,
      role: auth.role,
      userId: auth.userId,
      customerId: auth.customerId,
    });

    return {
      success: true,
      data: overview.pendingApprovals,
      error: null,
    };
  });

  app.get("/sessions", async (request) => {
    const auth = getUser(request);
    const mode = (request.query as { mode?: typeof auth.mode } | undefined)
      ?.mode;

    return {
      success: true,
      data: listAssistantSessions(app.db, {
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
        mode,
      }),
      error: null,
    };
  });

  app.post("/sessions", async (request, reply) => {
    const auth = getUser(request);
    const parsed = CreateAssistantSessionRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Invalid assistant session payload",
      });
    }

    const session = createAssistantSession({
      db: app.db,
      customerId: auth.customerId,
      userId: auth.userId,
      role: auth.role,
      mode: parsed.data.mode,
      title: parsed.data.title,
      sourcePage: parsed.data.sourcePage,
    });

    addAssistantEntry({
      db: app.db,
      sessionId: session.id,
      role: "system",
      entryType: "event",
      content:
        parsed.data.mode === "voice"
          ? "Voice session ready. Start listening or type a fallback transcript."
          : parsed.data.mode === "video"
            ? "Visual session ready. Add screenshot or dashboard context."
            : parsed.data.mode === "agentic"
              ? "Agentic planning session ready. Create a plan before execution."
              : "Text session ready.",
    });

    writeAuditLog(app.db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      customerId: auth.customerId,
      sessionId: auth.sessionId,
      action: "assistant.session.create",
      entityType: "assistant_session",
      entityId: String(session.id),
      details: {
        mode: session.mode,
        title: session.title,
      },
    });

    return reply.status(201).send({
      success: true,
      data: getAssistantSessionById(app.db, {
        sessionId: session.id,
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      }),
      error: null,
    });
  });

  app.get<{ Params: { id: string } }>(
    "/sessions/:id",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      return {
        success: true,
        data: session,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/entries",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      const parsed = AddAssistantEntryRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid assistant entry payload",
        });
      }

      const entry = addAssistantEntry({
        db: app.db,
        sessionId: session.id,
        role: parsed.data.role,
        entryType: parsed.data.entryType,
        content: parsed.data.content,
        metadata: parsed.data.metadata,
      });

      return {
        success: true,
        data: entry,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/voice-turn",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      const parsed = VoiceTurnRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid voice payload",
        });
      }

      const result = await handleVoiceTurn({
        db: app.db,
        sessionId: session.id,
        customerId: auth.customerId,
        role: auth.role,
        transcript: parsed.data.transcript,
      });

      return {
        success: true,
        data: {
          session: getAssistantSessionById(app.db, {
            sessionId: session.id,
            role: auth.role,
            userId: auth.userId,
            customerId: auth.customerId,
          }),
          reply: result.reply,
          shouldSpeak: parsed.data.shouldSpeak,
        },
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/visual-context",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      const parsed = VisualContextRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid visual context payload",
        });
      }

      const result = await handleVisualContext({
        db: app.db,
        sessionId: session.id,
        customerId: auth.customerId,
        role: auth.role,
        title: parsed.data.title,
        description: parsed.data.description,
        fileName: parsed.data.fileName,
        fileType: parsed.data.fileType,
        fileSize: parsed.data.fileSize,
      });

      return {
        success: true,
        data: {
          session: getAssistantSessionById(app.db, {
            sessionId: session.id,
            role: auth.role,
            userId: auth.userId,
            customerId: auth.customerId,
          }),
          reply: result.reply,
        },
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/create-document",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      const parsed = SessionDocumentRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid document request",
        });
      }

      const document = await createDocumentFromAssistantSession({
        db: app.db,
        session,
        kind: parsed.data.kind,
        title: parsed.data.title,
      });

      return {
        success: true,
        data: document,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/create-workflow",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      const parsed = SessionWorkflowRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          data: null,
          error: "Invalid workflow request",
        });
      }

      const result = await createWorkflowFromAssistantSession({
        db: app.db,
        session,
        task: parsed.data.task,
        autonomy: auth.autonomy,
        sessionId: auth.sessionId,
      });

      if (!result) {
        return reply.status(500).send({
          success: false,
          data: null,
          error: "Workflow could not be created",
        });
      }
      if ("error" in result) {
        return reply.status(403).send({
          success: false,
          data: null,
          error: result.error,
        });
      }

      return {
        success: true,
        data: result,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/close",
    async (request, reply) => {
      const auth = getUser(request);
      const session = getAssistantSessionById(app.db, {
        sessionId: Number(request.params.id),
        role: auth.role,
        userId: auth.userId,
        customerId: auth.customerId,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Assistant session not found",
        });
      }

      closeAssistantSession(app.db, session.id, "completed");
      return {
        success: true,
        data: getAssistantSessionById(app.db, {
          sessionId: session.id,
          role: auth.role,
          userId: auth.userId,
          customerId: auth.customerId,
        }),
        error: null,
      };
    },
  );

  app.post("/agentic/plans", async (request, reply) => {
    const auth = getUser(request);
    if (auth.mode !== "agentic") {
      return reply.status(400).send({
        success: false,
        data: null,
        error: "Switch to Agentic Mode before creating an execution plan",
      });
    }

    const task = (request.body as { task?: string } | undefined)?.task?.trim();
    if (!task) {
      return reply
        .status(400)
        .send({ success: false, data: null, error: "Task is required" });
    }

    const run = await createWorkflowRun({
      db: app.db,
      customerId: auth.customerId,
      userId: auth.userId,
      role: auth.role,
      sessionId: auth.sessionId,
      mode: auth.mode,
      autonomy: auth.autonomy,
      task,
    });

    if (!run) {
      return reply.status(500).send({
        success: false,
        data: null,
        error: "Agentic plan could not be created",
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
      action: "agentic.plan.create",
      entityType: "workflow_run",
      entityId: String(run.id),
      details: {
        task,
        autonomy: auth.autonomy,
        stepCount: run.steps.length,
      },
    });

    return {
      success: true,
      data: {
        ...run,
        requiresApproval: run.steps.some((step) => step.requiresApproval),
        timeoutSeconds: Math.max(
          0,
          Math.floor((Date.parse(run.expiresAt) - Date.now()) / 1000),
        ),
      },
      error: null,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/agentic/plans/:id",
    async (request, reply) => {
      const auth = getUser(request);
      const run = getWorkflowRunById(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!run) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Agentic plan not found",
        });
      }

      return {
        success: true,
        data: run,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/agentic/plans/:id/approve",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await approveWorkflowRun(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!result) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Agentic plan not found",
        });
      }
      if ("error" in result) {
        return reply
          .status(403)
          .send({ success: false, data: null, error: result.error });
      }

      return {
        success: true,
        data: {
          ...result,
          executionState: "approved_for_controlled_execution",
        },
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/agentic/plans/:id/cancel",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await cancelWorkflowRun(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!result) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Agentic plan not found",
        });
      }

      return {
        success: true,
        data: result,
        error: null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/agentic/plans/:id/run-next",
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

      return {
        success: true,
        data: result.run ?? null,
        clientAction: result.clientAction ?? null,
        notice: "notice" in result ? (result.notice ?? null) : null,
        error: result.error ?? null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/agentic/plans/:id/retry",
    async (request, reply) => {
      const auth = getUser(request);
      const result = await retryWorkflowRun(
        app.db,
        Number(request.params.id),
        auth.role,
        auth.userId,
      );

      if (!result) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: "Agentic plan not found",
        });
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
    },
  );
};
