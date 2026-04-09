import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, customers, hashSync, users } from "@autochain/db";
import { buildApp } from "../app.js";

describe("customer route authorization", () => {
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
          featureFlags: JSON.stringify(["agentic_mode"]),
          updatedAt: new Date().toISOString(),
        },
        {
          customerId: insertedCustomers[1]!.id,
          email: "purchasing@pacificglaze.com",
          passwordHash: hashSync("demo1234"),
          role: "customer",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify(["agentic_mode"]),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  it("scopes customers listing and detail routes to the authenticated customer", async () => {
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

    const list = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(list.statusCode).toBe(200);
    expect(
      (list.json() as { data: Array<{ companyName: string }> }).data,
    ).toHaveLength(1);
    expect(
      (list.json() as { data: Array<{ companyName: string }> }).data[0]!
        .companyName,
    ).toBe("Acme Windows & Doors");

    const otherCustomer = await app.inject({
      method: "GET",
      url: "/api/customers/2",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(otherCustomer.statusCode).toBe(403);
  });
});
