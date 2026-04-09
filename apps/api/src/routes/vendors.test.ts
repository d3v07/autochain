import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  customers,
  hashSync,
  users,
  vendorProfiles,
} from "@autochain/db";
import { buildApp } from "../app.js";

describe("vendor routes", () => {
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
          accountType: "client",
        },
        {
          companyName: "NorthStar Extrusions Supply",
          contactEmail: "ops@northstarextrusions.com",
          contactName: "Helen Brooks",
          accountNumber: "VND-101",
          accountType: "vendor",
        },
      ])
      .returning()
      .all();

    db.insert(vendorProfiles)
      .values({
        customerId: insertedCustomers[1]!.id,
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
          email: "ops@northstarextrusions.com",
          passwordHash: hashSync("demo1234"),
          role: "vendor",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify(["agentic_mode"]),
          updatedAt: new Date().toISOString(),
        },
        {
          customerId: insertedCustomers[0]!.id,
          email: "admin@autochain.io",
          passwordHash: hashSync("demo1234"),
          role: "admin",
          status: "active",
          mustResetPassword: false,
          featureFlags: JSON.stringify(["agentic_mode", "admin_ai"]),
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

  it("allows vendor users to load their own dashboard", async () => {
    const token = await login("ops@northstarextrusions.com");

    const res = await app.inject({
      method: "GET",
      url: "/api/vendors/dashboard",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        companyName: "NorthStar Extrusions Supply",
        accountNumber: "VND-101",
        vendorProfile: {
          vendorCode: "NSE-01",
        },
      },
    });
  });

  it("blocks client users from vendor routes", async () => {
    const token = await login("orders@acmewindows.com");

    const res = await app.inject({
      method: "GET",
      url: "/api/vendors/dashboard",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: "Vendor or admin access required",
    });
  });

  it("allows admins to list vendor accounts", async () => {
    const token = await login("admin@autochain.io");

    const res = await app.inject({
      method: "GET",
      url: "/api/vendors",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: [
        {
          companyName: "NorthStar Extrusions Supply",
          accountType: "vendor",
        },
      ],
    });
  });
});
