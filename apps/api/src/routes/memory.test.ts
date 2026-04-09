import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, customers, hashSync, users } from "@autochain/db";
import { buildApp } from "../app.js";

describe("memory routes", () => {
  let db: ReturnType<typeof createDb>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = createDb(":memory:");

    const insertedCustomers = db
      .insert(customers)
      .values([
        {
          companyName: "Acme Windows & Doors",
          contactEmail: "orders@acmewindows.com",
          contactName: "Sarah Mitchell",
          accountNumber: "ACM-001",
        },
        {
          companyName: "Pacific Coast Glazing",
          contactEmail: "purchasing@pacificglaze.com",
          contactName: "James Nakamura",
          accountNumber: "PCG-002",
        },
      ])
      .returning()
      .all();

    db.insert(users)
      .values([
        {
          customerId: insertedCustomers[0]!.id,
          email: "orders@acmewindows.com",
          passwordHash: hashSync("demo1234"),
          role: "customer",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify([]),
          updatedAt: new Date().toISOString(),
        },
        {
          customerId: insertedCustomers[1]!.id,
          email: "purchasing@pacificglaze.com",
          passwordHash: hashSync("demo1234"),
          role: "customer",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify([]),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  it("stores memory items and scopes search to the current tenant", async () => {
    const acmeLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "orders@acmewindows.com",
        password: "demo1234",
      },
    });

    const pacificLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "purchasing@pacificglaze.com",
        password: "demo1234",
      },
    });

    const acmeToken = (acmeLogin.json() as { data: { token: string } }).data
      .token;
    const pacificToken = (pacificLogin.json() as { data: { token: string } })
      .data.token;

    const create = await app.inject({
      method: "POST",
      url: "/api/memory",
      headers: {
        authorization: `Bearer ${acmeToken}`,
      },
      payload: {
        scope: "tenant",
        namespace: "ops",
        title: "Late payment watch",
        content: "Acme asked for a payment review next week.",
      },
    });

    expect(create.statusCode).toBe(201);

    const acmeSearch = await app.inject({
      method: "GET",
      url: "/api/memory/search?q=payment",
      headers: {
        authorization: `Bearer ${acmeToken}`,
      },
    });

    const pacificSearch = await app.inject({
      method: "GET",
      url: "/api/memory/search?q=payment",
      headers: {
        authorization: `Bearer ${pacificToken}`,
      },
    });

    expect((acmeSearch.json() as { data: unknown[] }).data).toHaveLength(1);
    expect((pacificSearch.json() as { data: unknown[] }).data).toHaveLength(0);
  });
});
