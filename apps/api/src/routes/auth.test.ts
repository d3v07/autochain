import { beforeEach, describe, expect, it } from "vitest";
import { createDb, customers, hashSync, users } from "@autochain/db";
import { buildApp } from "../app.js";

const ALL_USERS = [
  {
    email: "orders@acmewindows.com",
    role: "customer",
    company: "Acme Windows & Doors",
    accountNumber: "ACM-001",
  },
  {
    email: "purchasing@pacificglaze.com",
    role: "customer",
    company: "Pacific Coast Glazing",
    accountNumber: "PCG-002",
  },
  {
    email: "supply@heartlandfen.com",
    role: "customer",
    company: "Heartland Fenestration",
    accountNumber: "HLF-003",
  },
  {
    email: "ops@neglass.com",
    role: "customer",
    company: "Northeast Glass Partners",
    accountNumber: "NEG-004",
  },
  {
    email: "orders@sunbeltbp.com",
    role: "customer",
    company: "SunBelt Building Products",
    accountNumber: "SBP-005",
  },
  {
    email: "buy@mtnviewcs.com",
    role: "customer",
    company: "Mountain View Contractors",
    accountNumber: "MVC-006",
  },
  {
    email: "procurement@greatlakeswin.com",
    role: "customer",
    company: "Great Lakes Window Co",
    accountNumber: "GLW-007",
  },
  {
    email: "sales@seaglass.com",
    role: "customer",
    company: "Southeastern Architectural",
    accountNumber: "SEA-008",
  },
  {
    email: "orders@cascadefen.com",
    role: "customer",
    company: "Cascade Fenestration Group",
    accountNumber: "CFG-009",
  },
  {
    email: "purchasing@lonestardoors.com",
    role: "customer",
    company: "Lone Star Door Systems",
    accountNumber: "LSD-010",
  },
  {
    email: "ops@northstarextrusions.com",
    role: "vendor",
    company: "NorthStar Extrusions",
    accountNumber: "VND-101",
  },
  {
    email: "ops@bluepeakglass.com",
    role: "vendor",
    company: "BluePeak Glass",
    accountNumber: "VND-102",
  },
  {
    email: "ops@redriverhardware.com",
    role: "vendor",
    company: "RedRiver Hardware",
    accountNumber: "VND-103",
  },
  {
    email: "ops@summitseal.com",
    role: "vendor",
    company: "Summit Seal & Gasket Co",
    accountNumber: "VND-104",
  },
  {
    email: "ops@prairietrim.com",
    role: "vendor",
    company: "Prairie Accessories & Trim",
    accountNumber: "VND-105",
  },
  {
    email: "admin@autochain.io",
    role: "admin",
    company: "Acme Windows & Doors",
    accountNumber: "ACM-001",
  },
] as const;

describe("auth: all 16 seeded users can login", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    const db = createDb(":memory:");
    const passwordHash = hashSync("demo1234");

    const uniqueAccounts = new Map<string, (typeof ALL_USERS)[number]>();
    for (const u of ALL_USERS) {
      if (!uniqueAccounts.has(u.accountNumber))
        uniqueAccounts.set(u.accountNumber, u);
    }

    const insertedCustomers = db
      .insert(customers)
      .values(
        [...uniqueAccounts.values()].map((u) => ({
          companyName: u.company,
          contactEmail: u.email,
          contactName: "Test User",
          accountNumber: u.accountNumber,
          accountType:
            u.role === "vendor" ? ("vendor" as const) : ("client" as const),
          city: "Test City",
          state: "TX",
        })),
      )
      .returning()
      .all();

    const customerByAccount = new Map(
      insertedCustomers.map((c) => [c.accountNumber, c]),
    );

    db.insert(users)
      .values(
        ALL_USERS.map((u) => ({
          customerId: customerByAccount.get(u.accountNumber)!.id,
          email: u.email,
          passwordHash,
          role: u.role as "customer" | "vendor" | "admin",
          status: "active" as const,
          mustResetPassword: false,
          featureFlags: JSON.stringify([
            "voice_assistant",
            "video_assistant",
            "agentic_mode",
          ]),
          lastLoginAt: null,
          updatedAt: new Date().toISOString(),
        })),
      )
      .run();

    app = await buildApp({ db });
  });

  for (const user of ALL_USERS) {
    it(`${user.role} ${user.email} can login and gets correct role`, async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: user.email, password: "demo1234" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.token).toBeTruthy();
      expect(body.data.user.role).toBe(user.role);
      expect(body.data.user.email).toBe(user.email);
    });
  }

  it("rejects invalid password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ALL_USERS[0].email, password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it("rejects unknown email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "demo1234" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});
