import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, customers, hashSync, users } from "@autochain/db";
import { buildApp } from "../app.js";

describe("ai mode and agentic safety", () => {
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
        city: "Dallas",
        state: "TX",
      })
      .returning()
      .all();

    const [vendor] = db
      .insert(customers)
      .values({
        companyName: "NorthStar Extrusions Supply",
        contactEmail: "ops@northstarextrusions.com",
        contactName: "Helen Brooks",
        accountNumber: "VND-101",
        accountType: "vendor",
      })
      .returning()
      .all();

    db.insert(users)
      .values([
        {
          customerId: acme!.id,
          email: "orders@acmewindows.com",
          passwordHash: hashSync("demo1234"),
          role: "customer",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify([
            "voice_assistant",
            "video_assistant",
            "agentic_mode",
          ]),
          updatedAt: new Date().toISOString(),
        },
        {
          customerId: acme!.id,
          email: "admin@autochain.io",
          passwordHash: hashSync("demo1234"),
          role: "admin",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify([
            "voice_assistant",
            "video_assistant",
            "agentic_mode",
            "admin_ai",
          ]),
          updatedAt: new Date().toISOString(),
        },
        {
          customerId: vendor!.id,
          email: "ops@northstarextrusions.com",
          passwordHash: hashSync("demo1234"),
          role: "vendor",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify([
            "voice_assistant",
            "video_assistant",
            "agentic_mode",
          ]),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "demo1234" },
    });

    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { token: string } }).data.token;
  }

  it("requires agentic mode before creating an execution plan", async () => {
    const token = await login("orders@acmewindows.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/ai/agentic/plans",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { task: "check monthly reports and summarize" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: "Switch to Agentic Mode before creating an execution plan",
    });
  });

  it("blocks customer users from creating admin-only workflows", async () => {
    const token = await login("orders@acmewindows.com");

    await app.inject({
      method: "PATCH",
      url: "/api/ai/state",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { mode: "agentic", autonomy: "ask" },
    });

    const createPlan = await app.inject({
      method: "POST",
      url: "/api/ai/agentic/plans",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { task: "disable risky session and contact the account owner" },
    });

    expect(createPlan.statusCode).toBe(403);
    expect(createPlan.json()).toMatchObject({
      success: false,
      error:
        "This task requires permissions that are not available for your role",
    });
  });

  it("allows an agentic plan to be cancelled", async () => {
    const token = await login("admin@autochain.io");

    await app.inject({
      method: "PATCH",
      url: "/api/ai/state",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { mode: "agentic", autonomy: "agent" },
    });

    const createPlan = await app.inject({
      method: "POST",
      url: "/api/ai/agentic/plans",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { task: "check monthly reports and summarize" },
    });

    expect(createPlan.statusCode).toBe(200);
    const planId = (createPlan.json() as { data: { id: string } }).data.id;

    const cancel = await app.inject({
      method: "POST",
      url: `/api/ai/agentic/plans/${planId}/cancel`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({
      success: true,
      data: {
        id: planId,
        status: "cancelled",
      },
    });
  });

  it("runs safe navigation before approval and pauses only when the next step needs approval", async () => {
    const token = await login("orders@acmewindows.com");

    await app.inject({
      method: "PATCH",
      url: "/api/ai/state",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { mode: "agentic", autonomy: "ask" },
    });

    const createPlan = await app.inject({
      method: "POST",
      url: "/api/ai/agentic/plans",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { task: "Check unpaid invoices" },
    });

    expect(createPlan.statusCode).toBe(200);
    expect(createPlan.json()).toMatchObject({
      success: true,
      data: {
        status: "planned",
        steps: [
          { actionKey: "navigate.invoices", status: "pending" },
          { actionKey: "report.check_overdue_invoices", status: "pending" },
        ],
      },
    });

    const planId = (createPlan.json() as { data: { id: string } }).data.id;

    const runNavigation = await app.inject({
      method: "POST",
      url: `/api/ai/agentic/plans/${planId}/run-next`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(runNavigation.statusCode).toBe(200);
    expect(runNavigation.json()).toMatchObject({
      success: true,
      data: {
        status: "waiting_approval",
      },
      clientAction: {
        type: "navigate",
        href: "/invoices",
      },
    });

    const approve = await app.inject({
      method: "POST",
      url: `/api/ai/agentic/plans/${planId}/approve`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      success: true,
      data: {
        status: "running",
      },
    });
  });

  it("creates a voice session and stores transcript plus spoken reply", async () => {
    const token = await login("orders@acmewindows.com");

    const createSession = await app.inject({
      method: "POST",
      url: "/api/ai/sessions",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        mode: "voice",
        title: "Driver briefing",
        sourcePage: "/dashboard",
      },
    });

    expect(createSession.statusCode).toBe(201);
    const sessionId = (createSession.json() as { data: { id: number } }).data
      .id;

    const voiceTurn = await app.inject({
      method: "POST",
      url: `/api/ai/sessions/${sessionId}/voice-turn`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        transcript: "Give me a quick invoice summary",
        shouldSpeak: true,
      },
    });

    expect(voiceTurn.statusCode).toBe(200);
    expect(voiceTurn.json()).toMatchObject({
      success: true,
      data: {
        reply: expect.stringContaining("invoice"),
        shouldSpeak: true,
        session: {
          id: sessionId,
          mode: "voice",
          entries: expect.arrayContaining([
            expect.objectContaining({
              entryType: "transcript",
              role: "user",
            }),
            expect.objectContaining({
              entryType: "speech",
              role: "assistant",
            }),
          ]),
        },
      },
    });
  });

  it("captures visual context and can turn the session into a document and workflow", async () => {
    const token = await login("orders@acmewindows.com");

    const createSession = await app.inject({
      method: "POST",
      url: "/api/ai/sessions",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        mode: "video",
        title: "Visual review",
        sourcePage: "/insights",
      },
    });

    expect(createSession.statusCode).toBe(201);
    const sessionId = (createSession.json() as { data: { id: number } }).data
      .id;

    const visualContext = await app.inject({
      method: "POST",
      url: `/api/ai/sessions/${sessionId}/visual-context`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        title: "Invoice aging dashboard",
        description: "Two overdue balances stand out in the aging view.",
        fileName: "aging.png",
        fileType: "image/png",
        fileSize: 2048,
      },
    });

    expect(visualContext.statusCode).toBe(200);
    expect(visualContext.json()).toMatchObject({
      success: true,
      data: {
        reply: expect.stringContaining("Visual"),
        session: {
          id: sessionId,
          mode: "video",
        },
      },
    });

    const document = await app.inject({
      method: "POST",
      url: `/api/ai/sessions/${sessionId}/create-document`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        kind: "report",
        title: "Visual Review Summary",
      },
    });

    expect(document.statusCode).toBe(200);
    expect(document.json()).toMatchObject({
      success: true,
      data: {
        title: "Visual Review Summary",
        kind: "report",
      },
    });

    const workflow = await app.inject({
      method: "POST",
      url: `/api/ai/sessions/${sessionId}/create-workflow`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        task: "Use this visual session to create a guided workflow plan.",
      },
    });

    expect(workflow.statusCode).toBe(200);
    expect(workflow.json()).toMatchObject({
      success: true,
      data: {
        status: "planned",
      },
    });
  });

  it("creates a vendor workflow plan from an assistant session without leaking transcript keywords into planning", async () => {
    const token = await login("ops@northstarextrusions.com");

    const createSession = await app.inject({
      method: "POST",
      url: "/api/ai/sessions",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        mode: "agentic",
        title: "Vendor planning",
        sourcePage: "/vendor/dashboard",
      },
    });

    expect(createSession.statusCode).toBe(201);
    const sessionId = (createSession.json() as { data: { id: number } }).data
      .id;

    const createPlan = await app.inject({
      method: "POST",
      url: `/api/ai/sessions/${sessionId}/create-workflow`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        task: "Review constrained catalog and summarize next actions",
      },
    });

    expect(createPlan.statusCode).toBe(200);
    const json = createPlan.json() as {
      success: boolean;
      data: { task: string; steps: Array<{ actionKey: string }> };
    };
    expect(json.success).toBe(true);
    expect(json.data.task).toBe(
      "Review constrained catalog and summarize next actions",
    );
    expect(json.data.steps.map((step) => step.actionKey)).toEqual([
      "navigate.vendor.dashboard",
      "report.vendor_monthly",
      "navigate.vendor.catalog",
      "report.vendor_catalog_health",
    ]);
  });
});
