import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  customers,
  hashSync,
  purchaseOrders,
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

    const vendorUser = db
      .select()
      .from(users)
      .all()
      .find((entry) => entry.email === "ops@northstarextrusions.com");

    db.insert(purchaseOrders)
      .values({
        vendorCustomerId: insertedCustomers[1]!.id,
        issuedByUserId: vendorUser!.id,
        purchaseOrderNumber: "PO-2001",
        status: "confirmed",
        expectedShipDate: "2026-04-15",
        total: 12600,
      })
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

  it("lets vendors create and update freight tracking for a purchase order", async () => {
    const token = await login("ops@northstarextrusions.com");

    const update = await app.inject({
      method: "PUT",
      url: "/api/vendors/purchase-orders/1/shipment",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        carrier: "XPO Logistics",
        trackingNumber: "XPO-7781",
        status: "in_transit",
        estimatedDelivery: "2026-04-18",
        note: "Freight left the dock.",
        location: "Cleveland, OH",
      },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      success: true,
      data: {
        purchaseOrderId: 1,
        carrier: "XPO Logistics",
        trackingNumber: "XPO-7781",
        status: "in_transit",
        purchaseOrderStatus: "shipped",
        events: [
          expect.objectContaining({
            description: "Freight left the dock.",
            location: "Cleveland, OH",
          }),
        ],
      },
    });
  });
});
