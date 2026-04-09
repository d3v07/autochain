import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assistantEntries,
  assistantSessions,
  chatCaches,
  createDb,
  customers,
  hashSync,
  users,
  vendorProfiles,
} from "@autochain/db";
import { buildApp } from "../app.js";

describe("chat transcript and cache persistence", () => {
  let db: ReturnType<typeof createDb>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    db = createDb(":memory:");

    const [vendorCustomer] = db
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

    db.insert(vendorProfiles)
      .values({
        customerId: vendorCustomer!.id,
        vendorCode: "NSE-01",
        categoryFocus: "frames",
        paymentTerms: "Net 30",
        leadTimeDays: 14,
        reliabilityScore: 94,
        preferredShippingMethod: "LTL freight",
        operationsEmail: "ops@northstarextrusions.com",
      })
      .run();

    db.insert(users)
      .values({
        customerId: vendorCustomer!.id,
        email: "ops@northstarextrusions.com",
        passwordHash: hashSync("demo1234"),
        role: "vendor",
        status: "active",
        mustResetPassword: false,
        featureFlags: JSON.stringify(["voice_assistant", "agentic_mode"]),
        updatedAt: new Date().toISOString(),
      })
      .run();

    global.fetch = vi.fn(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              '{"message":{"content":"Vendor "}}\n{"message":{"content":"reply"}}\n{"done":true}\n',
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    app = await buildApp({ db });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  async function login() {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@northstarextrusions.com", password: "demo1234" },
    });

    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { token: string } }).data.token;
  }

  it("stores vendor chat entries and increments frequent prompt cache by session", async () => {
    const token = await login();

    const createSession = await app.inject({
      method: "POST",
      url: "/api/ai/sessions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mode: "text",
        title: "Vendor text session",
        sourcePage: "/vendor/dashboard",
      },
    });

    expect(createSession.statusCode).toBe(201);
    const sessionId = (createSession.json() as { data: { id: number } }).data
      .id;

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId,
        message: "Summarize pending vendor invoices",
        history: [],
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body).toContain("Vendor ");
    expect(firstResponse.body).toContain("reply");

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId,
        message: "Summarize pending vendor invoices",
        history: [],
      },
    });

    expect(secondResponse.statusCode).toBe(200);

    const session = db
      .select()
      .from(assistantSessions)
      .where(eq(assistantSessions.id, sessionId))
      .get();
    expect(session).toBeTruthy();

    const entries = db
      .select()
      .from(assistantEntries)
      .where(eq(assistantEntries.sessionId, sessionId))
      .all();
    const messages = entries.filter((entry) => entry.entryType === "message");
    expect(messages).toHaveLength(4);
    expect(
      messages.some(
        (entry) =>
          entry.role === "user" &&
          entry.content === "Summarize pending vendor invoices",
      ),
    ).toBe(true);
    expect(
      messages
        .filter((entry) => entry.role === "assistant")
        .every((entry) => entry.content === "Vendor reply"),
    ).toBe(true);

    const cacheRows = db.select().from(chatCaches).all();
    expect(cacheRows).toHaveLength(1);
    expect(cacheRows[0]).toMatchObject({
      sessionId,
      role: "vendor",
      promptLabel: "Summarize pending vendor invoices",
      hitCount: 2,
    });
  });
});
