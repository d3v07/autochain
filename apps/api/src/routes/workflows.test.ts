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
});
