import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  customerPrices,
  customers,
  hashSync,
  orderLines,
  orders,
  products,
  users,
  vendorCatalogItems,
} from "@autochain/db";
import { buildApp } from "../app.js";

describe("insight visualization routes", () => {
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
        {
          companyName: "BluePeak Glass Partners",
          contactEmail: "ops@bluepeakglass.com",
          contactName: "Rafael Ortiz",
          accountNumber: "VND-102",
          accountType: "vendor",
        },
      ])
      .returning()
      .all();

    db.insert(users)
      .values({
        customerId: insertedCustomers[0]!.id,
        email: "orders@acmewindows.com",
        passwordHash: hashSync("demo1234"),
        role: "customer",
        status: "active",
        mustResetPassword: false,
        featureFlags: JSON.stringify(["agentic_mode"]),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const insertedProducts = db
      .insert(products)
      .values([
        {
          sku: "WIN-100",
          name: "Awning Window 36x24",
          description: "Awning window",
          category: "windows",
          unitPrice: 100,
        },
        {
          sku: "GLS-200",
          name: "Low-E Glass Unit",
          description: "Insulated glass unit",
          category: "glass",
          unitPrice: 160,
        },
      ])
      .returning()
      .all();

    db.insert(customerPrices)
      .values([
        {
          customerId: insertedCustomers[0]!.id,
          productId: insertedProducts[0]!.id,
          discountPct: 12,
        },
        {
          customerId: insertedCustomers[0]!.id,
          productId: insertedProducts[1]!.id,
          customPrice: 128,
        },
      ])
      .run();

    const insertedOrders = db
      .insert(orders)
      .values([
        {
          customerId: insertedCustomers[0]!.id,
          orderNumber: "ESP-2026-0001",
          status: "shipped",
          total: 1960,
          createdAt: "2026-02-14T10:00:00.000Z",
        },
        {
          customerId: insertedCustomers[0]!.id,
          orderNumber: "ESP-2026-0002",
          status: "processing",
          total: 2280,
          createdAt: "2026-03-12T10:00:00.000Z",
        },
      ])
      .returning()
      .all();

    db.insert(orderLines)
      .values([
        {
          orderId: insertedOrders[0]!.id,
          productId: insertedProducts[0]!.id,
          quantity: 10,
          unitPrice: 100,
          lineTotal: 1000,
        },
        {
          orderId: insertedOrders[0]!.id,
          productId: insertedProducts[1]!.id,
          quantity: 6,
          unitPrice: 160,
          lineTotal: 960,
        },
        {
          orderId: insertedOrders[1]!.id,
          productId: insertedProducts[0]!.id,
          quantity: 12,
          unitPrice: 100,
          lineTotal: 1200,
        },
        {
          orderId: insertedOrders[1]!.id,
          productId: insertedProducts[1]!.id,
          quantity: 6,
          unitPrice: 180,
          lineTotal: 1080,
        },
      ])
      .run();

    db.insert(vendorCatalogItems)
      .values([
        {
          vendorCustomerId: insertedCustomers[1]!.id,
          productId: insertedProducts[0]!.id,
          vendorSku: "NSE-WIN-100",
          unitCost: 72,
          minimumOrderQty: 10,
          leadTimeDays: 12,
          availableQty: 400,
          status: "active",
        },
        {
          vendorCustomerId: insertedCustomers[2]!.id,
          productId: insertedProducts[1]!.id,
          vendorSku: "BPG-GLS-200",
          unitCost: 118,
          minimumOrderQty: 6,
          leadTimeDays: 16,
          availableQty: 240,
          status: "active",
        },
      ])
      .run();

    app = await buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  async function login() {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "orders@acmewindows.com", password: "demo1234" },
    });

    expect(res.statusCode).toBe(200);
    return (res.json() as { data: { token: string } }).data.token;
  }

  it("renders a savings histogram from a natural-language prompt", async () => {
    const token = await login();

    const res = await app.inject({
      method: "POST",
      url: "/api/insights/visualization",
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: "Compare savings for last few months" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        chartType: "histogram",
        title: "Contract Savings Opportunity",
        unit: "currency",
        series: expect.arrayContaining([
          expect.objectContaining({ label: expect.any(String) }),
        ]),
      },
    });
  });

  it("renders a vendor distribution pie chart from a natural-language prompt", async () => {
    const token = await login();

    const res = await app.inject({
      method: "POST",
      url: "/api/insights/visualization",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        prompt: "Show distribution of our business through different vendors",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        chartType: "pie",
        title: "Vendor Spend Distribution",
        series: expect.arrayContaining([
          expect.objectContaining({ label: "NorthStar Extrusions Supply" }),
          expect.objectContaining({ label: "BluePeak Glass Partners" }),
        ]),
      },
    });
  });
});
