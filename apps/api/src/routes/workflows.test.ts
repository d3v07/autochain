import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, customers, hashSync, users } from "@autochain/db";
import { buildApp } from "../app.js";

describe("workflow runtime", () => {
  let db: ReturnType<typeof createDb>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = createDb(":memory:");

    const [acme] = db
      .insert(customers)
      .values({
        companyName: "Acme Windows & Doors",
        contactEmail: "orders@acmewindows.com",
        contactName: "Sarah Mitchell",
        accountNumber: "ACM-001",
      })
      .returning()
      .all();

    db.insert(users)
      .values({
        customerId: acme!.id,
        email: "orders@acmewindows.com",
        passwordHash: hashSync("demo1234"),
        role: "customer",
        status: "active",
        mustResetPassword: false,
        featureFlags: JSON.stringify(["agentic_mode"]),
        updatedAt: new Date().toISOString(),
      })
      .run();

    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  async function loginAndEnableAgentic() {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "orders@acmewindows.com",
        password: "demo1234",
      },
    });

    expect(login.statusCode).toBe(200);
    const token = (login.json() as { data: { token: string } }).data.token;

    const state = await app.inject({
      method: "PATCH",
      url: "/api/ai/state",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        mode: "agentic",
        autonomy: "ask",
      },
    });

    expect(state.statusCode).toBe(200);
    return token;
  }

  it("creates, approves, and executes a workflow that generates a document", async () => {
    const token = await loginAndEnableAgentic();

    const create = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        task: "Check monthly reports and summarize.",
      },
    });

    expect(create.statusCode).toBe(201);
    const runId = (create.json() as { data: { id: number } }).data.id;

    const approve = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/approve`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(approve.statusCode).toBe(200);

    const runNavigation = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(runNavigation.statusCode).toBe(200);
    expect(runNavigation.json()).toMatchObject({
      success: true,
      clientAction: {
        type: "navigate",
        href: "/dashboard",
      },
    });

    const runGeneration = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(runGeneration.statusCode).toBe(200);
    expect(
      (runGeneration.json() as { data: { artifacts: unknown[] } }).data
        .artifacts.length,
    ).toBeGreaterThan(0);

    const documents = await app.inject({
      method: "GET",
      url: "/api/documents",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(documents.statusCode).toBe(200);
    expect((documents.json() as { data: unknown[] }).data.length).toBe(1);
  });

  it("creates an orchestrated workflow from explicit actions and executes a fan-out batch", async () => {
    const token = await loginAndEnableAgentic();

    const create = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        task: "Run a multi-agent invoice and inventory control-tower review.",
        actionKeys: [
          "navigate.dashboard",
          "report.check_overdue_invoices",
          "report.inventory_reorder",
          "document.generate_agreement",
        ],
        orchestration: {
          enabled: true,
          coordinatorRole: "orchestrator",
          strategy: "parallel_fanout",
          summary:
            "Split the review across finance and inventory, then consolidate the output.",
          agents: [
            {
              role: "orchestrator",
              label: "Orchestrator",
              objective: "Coordinate the run and merge outputs.",
              capabilities: ["routing", "handoffs"],
            },
            {
              role: "finance_analyst",
              label: "Finance Analyst",
              objective: "Review invoice exposure.",
              capabilities: ["invoice-review"],
            },
            {
              role: "inventory_analyst",
              label: "Inventory Analyst",
              objective: "Review reorder and stock implications.",
              capabilities: ["inventory-review"],
            },
            {
              role: "document_specialist",
              label: "Document Specialist",
              objective: "Package final outputs.",
              capabilities: ["document-generation"],
            },
          ],
          assignments: {
            "navigate.dashboard": "orchestrator",
            "report.check_overdue_invoices": "finance_analyst",
            "report.inventory_reorder": "inventory_analyst",
            "document.generate_agreement": "document_specialist",
          },
        },
      },
    });

    expect(create.statusCode).toBe(201);
    const createdRun = create.json() as {
      data: {
        id: number;
        orchestration: { strategy: string } | null;
        steps: Array<{
          actionKey: string;
          agentRole: string | null;
          dependsOnStepNumbers?: number[];
          parallelGroup?: string | null;
        }>;
        artifacts: Array<{ kind: string }>;
      };
    };

    expect(createdRun.data.orchestration?.strategy).toBe("parallel_fanout");
    expect(createdRun.data.steps.map((step) => step.agentRole)).toEqual([
      "orchestrator",
      "finance_analyst",
      "inventory_analyst",
      "document_specialist",
    ]);
    expect(createdRun.data.steps[1]?.parallelGroup).toBe("fanout-1");
    expect(createdRun.data.steps[2]?.parallelGroup).toBe("fanout-1");
    expect(createdRun.data.steps[3]?.dependsOnStepNumbers).toEqual([2, 3]);
    expect(
      createdRun.data.artifacts.some(
        (artifact) => artifact.kind === "orchestration_manifest",
      ),
    ).toBe(true);

    const runId = createdRun.data.id;

    const approve = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/approve`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(approve.statusCode).toBe(200);

    const runNavigation = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(runNavigation.statusCode).toBe(200);
    expect(runNavigation.json()).toMatchObject({
      success: true,
      clientAction: {
        type: "navigate",
        href: "/dashboard",
      },
    });

    const runFanout = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(runFanout.statusCode).toBe(200);
    expect(
      (
        runFanout.json() as {
          data: {
            steps: Array<{ actionKey: string; status: string }>;
          };
        }
      ).data.steps
        .filter((step) =>
          [
            "report.check_overdue_invoices",
            "report.inventory_reorder",
          ].includes(step.actionKey),
        )
        .every((step) => step.status === "completed"),
    ).toBe(true);

    const runFinalize = await app.inject({
      method: "POST",
      url: `/api/workflows/${runId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(runFinalize.statusCode).toBe(200);
    expect(
      (
        runFinalize.json() as {
          data: { status: string; artifacts: unknown[] };
        }
      ).data.status,
    ).toBe("completed");

    const documents = await app.inject({
      method: "GET",
      url: "/api/documents",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(documents.statusCode).toBe(200);
    expect((documents.json() as { data: unknown[] }).data.length).toBe(3);
  });
});
