import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  customers,
  hashSync,
  users,
  userSessions,
} from "@autochain/db";
import { buildApp } from "../app.js";

describe("admin auth and session controls", () => {
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
    return res.json() as {
      data: {
        token: string;
        session: { id: number };
      };
    };
  }

  it("blocks customer users from admin routes", async () => {
    const auth = await login("orders@acmewindows.com");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: {
        authorization: `Bearer ${auth.data.token}`,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: "Admin access required",
    });
  });

  it("revokes sessions and invalidates the bearer token", async () => {
    const auth = await login("admin@autochain.io");

    const revoke = await app.inject({
      method: "POST",
      url: `/api/admin/sessions/${auth.data.session.id}/revoke`,
      headers: {
        authorization: `Bearer ${auth.data.token}`,
      },
    });

    expect(revoke.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${auth.data.token}`,
      },
    });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toMatchObject({
      success: false,
      error: "Invalid or expired session",
    });
  });

  it("disabling a user revokes that user's active sessions", async () => {
    const adminAuth = await login("admin@autochain.io");
    const customerAuth = await login("orders@acmewindows.com");
    const customerSession = db
      .select()
      .from(userSessions)
      .all()
      .find((session) => session.sessionToken === customerAuth.data.token);
    const customer = db
      .select()
      .from(users)
      .all()
      .find((user) => user.email === "orders@acmewindows.com");

    expect(customerSession).toBeTruthy();
    expect(customer).toBeTruthy();

    const disable = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${customer!.id}`,
      headers: {
        authorization: `Bearer ${adminAuth.data.token}`,
      },
      payload: {
        status: "disabled",
      },
    });

    expect(disable.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${customerAuth.data.token}`,
      },
    });

    expect(me.statusCode).toBe(401);
  });
});
