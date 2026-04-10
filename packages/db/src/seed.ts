import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import { hashSync } from "./hash.js";
import { openSqlite, getDbPath } from "./client.js";

const forceReseed = process.argv.includes("--force");
const dbPath = getDbPath();
console.log(`Using database: ${dbPath}`);
const sqlite = openSqlite(dbPath);
const db = drizzle(sqlite, { schema });

// Check if database already has users — skip seeding to preserve sessions/docs
const existingUsers = db.select().from(schema.users).all();
if (existingUsers.length > 0 && !forceReseed) {
  console.log(
    `Database already seeded (${existingUsers.length} users). Skipping to preserve sessions and documents.`,
  );
  console.log("Run with --force to wipe and re-seed.");
  sqlite.close();
  process.exit(0);
}

// Clear existing data (only runs on first seed or --force)
db.delete(schema.assistantEntries).run();
db.delete(schema.chatCaches).run();
db.delete(schema.assistantSessions).run();
db.delete(schema.workflowArtifacts).run();
db.delete(schema.workflowCheckpoints).run();
db.delete(schema.workflowEvents).run();
db.delete(schema.workflowSteps).run();
db.delete(schema.workflowRuns).run();
db.delete(schema.documentVersions).run();
db.delete(schema.documents).run();
db.delete(schema.memoryItems).run();
db.delete(schema.connectorAccounts).run();
db.delete(schema.auditLogs).run();
db.delete(schema.userSessions).run();
db.delete(schema.ediTransactions).run();
db.delete(schema.shipments).run();
db.delete(schema.invoices).run();
db.delete(schema.vendorShipments).run();
db.delete(schema.vendorInvoices).run();
db.delete(schema.purchaseOrderLines).run();
db.delete(schema.purchaseOrders).run();
db.delete(schema.orderLines).run();
db.delete(schema.orders).run();
db.delete(schema.customerPrices).run();
db.delete(schema.vendorCatalogItems).run();
db.delete(schema.vendorProfiles).run();
db.delete(schema.users).run();
db.delete(schema.inventory).run();
db.delete(schema.products).run();
db.delete(schema.customers).run();

// Seed customers
const customerData = [
  {
    companyName: "Acme Windows & Doors",
    contactEmail: "orders@acmewindows.com",
    contactName: "Sarah Mitchell",
    accountNumber: "ACM-001",
    phone: "555-0101",
    address: "1200 Industrial Blvd",
    city: "Dallas",
    state: "TX",
    zip: "75201",
  },
  {
    companyName: "Pacific Coast Glazing",
    contactEmail: "purchasing@pacificglaze.com",
    contactName: "James Nakamura",
    accountNumber: "PCG-002",
    phone: "555-0102",
    address: "8500 Harbor Way",
    city: "Long Beach",
    state: "CA",
    zip: "90802",
  },
  {
    companyName: "Heartland Fenestration Supply",
    contactEmail: "supply@heartlandfen.com",
    contactName: "Linda Kowalski",
    accountNumber: "HFS-003",
    phone: "555-0103",
    address: "340 Prairie Rd",
    city: "Omaha",
    state: "NE",
    zip: "68102",
  },
  {
    companyName: "Northeast Glass Partners",
    contactEmail: "ops@neglass.com",
    contactName: "Robert Chen",
    accountNumber: "NGP-004",
    phone: "555-0104",
    address: "77 Commercial St",
    city: "Boston",
    state: "MA",
    zip: "02110",
  },
  {
    companyName: "SunBelt Building Products",
    contactEmail: "orders@sunbeltbp.com",
    contactName: "Maria Gonzalez",
    accountNumber: "SBP-005",
    phone: "555-0105",
    address: "2100 Peachtree Ln",
    city: "Atlanta",
    state: "GA",
    zip: "30303",
  },
  {
    companyName: "Mountain View Contractors Supply",
    contactEmail: "buy@mtnviewcs.com",
    contactName: "Tom Henderson",
    accountNumber: "MVC-006",
    phone: "555-0106",
    address: "950 Foothill Dr",
    city: "Denver",
    state: "CO",
    zip: "80202",
  },
  {
    companyName: "Great Lakes Window Co",
    contactEmail: "procurement@greatlakeswin.com",
    contactName: "Patricia Nowak",
    accountNumber: "GLW-007",
    phone: "555-0107",
    address: "620 Lakeshore Blvd",
    city: "Chicago",
    state: "IL",
    zip: "60601",
  },
  {
    companyName: "Southeastern Architectural Glass",
    contactEmail: "sales@seaglass.com",
    contactName: "David Williams",
    accountNumber: "SAG-008",
    phone: "555-0108",
    address: "1800 Magnolia Ave",
    city: "Charlotte",
    state: "NC",
    zip: "28202",
  },
  {
    companyName: "Cascade Fenestration Group",
    contactEmail: "orders@cascadefen.com",
    contactName: "Derek Olsen",
    accountNumber: "CFG-009",
    phone: "555-0109",
    address: "2300 Willamette Industrial Pkwy",
    city: "Portland",
    state: "OR",
    zip: "97201",
  },
  {
    companyName: "Lone Star Door Systems",
    contactEmail: "purchasing@lonestardoors.com",
    contactName: "Angela Reyes",
    accountNumber: "LSD-010",
    phone: "555-0110",
    address: "4700 Gulf Freeway Suite 200",
    city: "Houston",
    state: "TX",
    zip: "77003",
  },
  {
    companyName: "NorthStar Extrusions Supply",
    contactEmail: "ops@northstarextrusions.com",
    contactName: "Helen Brooks",
    accountNumber: "VND-101",
    accountType: "vendor" as const,
    phone: "555-0201",
    address: "420 Alloy Park",
    city: "Cleveland",
    state: "OH",
    zip: "44114",
  },
  {
    companyName: "BluePeak Glass Manufacturing",
    contactEmail: "ops@bluepeakglass.com",
    contactName: "Omar Rahman",
    accountNumber: "VND-102",
    accountType: "vendor" as const,
    phone: "555-0202",
    address: "88 Furnace Ave",
    city: "Toledo",
    state: "OH",
    zip: "43604",
  },
  {
    companyName: "RedRiver Hardware Components",
    contactEmail: "ops@redriverhardware.com",
    contactName: "Keisha Turner",
    accountNumber: "VND-103",
    accountType: "vendor" as const,
    phone: "555-0203",
    address: "915 Foundry Loop",
    city: "Memphis",
    state: "TN",
    zip: "38103",
  },
  {
    companyName: "Summit Seal & Gasket Co",
    contactEmail: "ops@summitseal.com",
    contactName: "Yusuf Amir",
    accountNumber: "VND-104",
    accountType: "vendor" as const,
    phone: "555-0204",
    address: "1700 Copper Basin Rd",
    city: "Phoenix",
    state: "AZ",
    zip: "85004",
  },
  {
    companyName: "Prairie Accessories & Trim",
    contactEmail: "ops@prairietrim.com",
    contactName: "Jenna Caldwell",
    accountNumber: "VND-105",
    accountType: "vendor" as const,
    phone: "555-0205",
    address: "310 Stockyards Dr",
    city: "Kansas City",
    state: "MO",
    zip: "64101",
  },
];

const insertedCustomers = db
  .insert(schema.customers)
  .values(customerData)
  .returning()
  .all();
console.log(`Seeded ${insertedCustomers.length} customers`);

// Seed products
const productData = [
  // Windows
  {
    sku: "WIN-VDH-3648",
    name: "Vinyl Double-Hung Window 36x48",
    description:
      "Energy-efficient vinyl double-hung window with Low-E glass, tilt-in sashes",
    category: "windows" as const,
    unitPrice: 285.0,
  },
  {
    sku: "WIN-VDH-2436",
    name: "Vinyl Double-Hung Window 24x36",
    description:
      "Compact vinyl double-hung window for residential applications",
    category: "windows" as const,
    unitPrice: 195.0,
  },
  {
    sku: "WIN-CSM-4860",
    name: "Casement Window 48x60",
    description:
      "Vinyl casement window with multi-point locking, crank operator",
    category: "windows" as const,
    unitPrice: 420.0,
  },
  {
    sku: "WIN-SLD-6048",
    name: "Sliding Window 60x48",
    description: "Horizontal sliding window with dual pane insulated glass",
    category: "windows" as const,
    unitPrice: 340.0,
  },
  {
    sku: "WIN-PIC-7248",
    name: "Picture Window 72x48",
    description: "Fixed picture window with triple-pane glass, argon filled",
    category: "windows" as const,
    unitPrice: 510.0,
  },
  {
    sku: "WIN-AWN-3624",
    name: "Awning Window 36x24",
    description:
      "Top-hinged awning window, ideal for ventilation in wet climates",
    category: "windows" as const,
    unitPrice: 265.0,
  },
  {
    sku: "WIN-BAY-9660",
    name: "Bay Window Unit 96x60",
    description: "Three-panel bay window with 30-degree side panels",
    category: "windows" as const,
    unitPrice: 1250.0,
  },

  // Doors
  {
    sku: "DOR-SLD-7280",
    name: "Aluminum Sliding Patio Door 72x80",
    description: "Heavy-duty aluminum sliding door with tempered glass panels",
    category: "doors" as const,
    unitPrice: 780.0,
  },
  {
    sku: "DOR-FRN-3680",
    name: "French Door Set 36x80",
    description:
      "Double french door pair with multi-point lock, decorative grilles",
    category: "doors" as const,
    unitPrice: 1150.0,
  },
  {
    sku: "DOR-ENT-3680",
    name: "Fiberglass Entry Door 36x80",
    description: "Insulated fiberglass entry door with sidelite option",
    category: "doors" as const,
    unitPrice: 650.0,
  },
  {
    sku: "DOR-BFD-9680",
    name: "Bi-Fold Patio Door 96x80",
    description: "Four-panel bi-fold door system with aluminum frame",
    category: "doors" as const,
    unitPrice: 2800.0,
  },
  {
    sku: "DOR-STM-3680",
    name: "Storm Door 36x80",
    description: "Full-view storm door with retractable screen",
    category: "doors" as const,
    unitPrice: 320.0,
  },

  // Hardware
  {
    sku: "HDW-LCK-SLD",
    name: "Sliding Door Lock Assembly",
    description: "Mortise lock with hook bolt for sliding doors",
    category: "hardware" as const,
    unitPrice: 45.0,
  },
  {
    sku: "HDW-HNG-CSM",
    name: "Casement Hinge Set (pair)",
    description: "Stainless steel friction hinges for casement windows",
    category: "hardware" as const,
    unitPrice: 32.0,
  },
  {
    sku: "HDW-CRK-OPR",
    name: "Crank Operator Assembly",
    description: "Roto-gear crank operator for casement and awning windows",
    category: "hardware" as const,
    unitPrice: 28.0,
  },
  {
    sku: "HDW-MPL-3PT",
    name: "Multi-Point Lock System",
    description: "Three-point locking system for entry and french doors",
    category: "hardware" as const,
    unitPrice: 85.0,
  },
  {
    sku: "HDW-RLR-KIT",
    name: "Roller Kit for Sliding Windows",
    description: "Tandem roller assembly with adjustment screws",
    category: "hardware" as const,
    unitPrice: 18.5,
  },
  {
    sku: "HDW-BAL-SPR",
    name: "Spring Balance Set (pair)",
    description: "Constant-force spring balances for double-hung windows",
    category: "hardware" as const,
    unitPrice: 22.0,
  },

  // Glass
  {
    sku: "GLS-LOW-E2",
    name: "Low-E Double Pane IG Unit",
    description: "Insulated glass unit with Low-E coating, argon filled",
    category: "glass" as const,
    unitPrice: 125.0,
  },
  {
    sku: "GLS-LOW-E3",
    name: "Low-E Triple Pane IG Unit",
    description: "Triple-pane insulated glass with dual Low-E coatings",
    category: "glass" as const,
    unitPrice: 210.0,
  },
  {
    sku: "GLS-TMP-CLR",
    name: "Tempered Clear Glass Panel",
    description: "Safety tempered clear glass, custom sizes available",
    category: "glass" as const,
    unitPrice: 75.0,
  },
  {
    sku: "GLS-LAM-SEC",
    name: "Laminated Security Glass",
    description: "PVB interlayer laminated glass for impact resistance",
    category: "glass" as const,
    unitPrice: 165.0,
  },
  {
    sku: "GLS-OBS-PRV",
    name: "Obscure Privacy Glass",
    description: "Pattern obscure glass for bathrooms and privacy applications",
    category: "glass" as const,
    unitPrice: 95.0,
  },

  // Weatherstripping
  {
    sku: "WTH-FIN-BLK",
    name: "Fin Seal Weatherstrip (100ft)",
    description: "Polypropylene fin seal for sliding windows and doors",
    category: "weatherstripping" as const,
    unitPrice: 35.0,
  },
  {
    sku: "WTH-BLB-EPD",
    name: "Bulb Seal EPDM (50ft)",
    description: "EPDM rubber bulb seal for compression applications",
    category: "weatherstripping" as const,
    unitPrice: 42.0,
  },
  {
    sku: "WTH-PIL-WOV",
    name: "Woven Pile Strip (100ft)",
    description: "Woven polypropylene pile weatherstrip with adhesive backing",
    category: "weatherstripping" as const,
    unitPrice: 28.0,
  },
  {
    sku: "WTH-FLG-VNL",
    name: "Vinyl Flap Seal (50ft)",
    description: "Flexible vinyl flap seal for door bottoms",
    category: "weatherstripping" as const,
    unitPrice: 24.0,
  },

  // Frames
  {
    sku: "FRM-VNL-WHT",
    name: "Vinyl Frame Extrusion - White (20ft)",
    description: "Multi-chamber vinyl profile, UV stabilized, white",
    category: "frames" as const,
    unitPrice: 48.0,
  },
  {
    sku: "FRM-VNL-TAN",
    name: "Vinyl Frame Extrusion - Tan (20ft)",
    description: "Multi-chamber vinyl profile, UV stabilized, desert tan",
    category: "frames" as const,
    unitPrice: 52.0,
  },
  {
    sku: "FRM-ALM-BRZ",
    name: "Aluminum Frame - Bronze (20ft)",
    description: "Thermally broken aluminum extrusion, bronze anodized",
    category: "frames" as const,
    unitPrice: 78.0,
  },
  {
    sku: "FRM-ALM-CLR",
    name: "Aluminum Frame - Clear (20ft)",
    description: "Thermally broken aluminum extrusion, clear anodized",
    category: "frames" as const,
    unitPrice: 72.0,
  },
  {
    sku: "FRM-FBG-WHT",
    name: "Fiberglass Frame Profile (20ft)",
    description: "Pultruded fiberglass frame, paintable, white",
    category: "frames" as const,
    unitPrice: 95.0,
  },

  // Accessories
  {
    sku: "ACC-SCR-RET",
    name: "Retractable Screen Kit",
    description: "Roll-away insect screen for casement and awning windows",
    category: "accessories" as const,
    unitPrice: 65.0,
  },
  {
    sku: "ACC-GRL-SDL",
    name: "SDL Grille Kit (colonial)",
    description:
      "Simulated divided lite grille bars, snap-in, colonial pattern",
    category: "accessories" as const,
    unitPrice: 38.0,
  },
  {
    sku: "ACC-SIL-MRB",
    name: 'Marble Window Sill 36"',
    description: "Cultured marble interior window sill, 36-inch",
    category: "accessories" as const,
    unitPrice: 55.0,
  },
  {
    sku: "ACC-TRM-INT",
    name: "Interior Trim Kit",
    description: "Pre-finished interior casing and extension jambs",
    category: "accessories" as const,
    unitPrice: 42.0,
  },
  {
    sku: "ACC-FLH-KIT",
    name: "Flashing Kit",
    description: "Self-adhesive window/door flashing membrane kit",
    category: "accessories" as const,
    unitPrice: 29.0,
  },
  {
    sku: "ACC-CLK-SPC",
    name: "Spacer Bar Kit (warm-edge)",
    description: "Warm-edge spacer bars for IG unit assembly",
    category: "accessories" as const,
    unitPrice: 15.0,
  },
];

const insertedProducts = db
  .insert(schema.products)
  .values(productData)
  .returning()
  .all();
console.log(`Seeded ${insertedProducts.length} products`);

// Seed inventory (with some deliberately low-stock items for insights)
const inventoryData = insertedProducts.map((p, i) => {
  // Make a few items low stock or out of stock
  let qty = 100 + Math.floor(Math.random() * 900);
  if (i === 5) qty = 12; // Awning Window — low stock
  if (i === 14) qty = 0; // Roller Kit — out of stock
  if (i === 22) qty = 8; // Woven Pile Strip — low stock
  if (i === 29) qty = 3; // Retractable Screen — very low
  if (i === 17) qty = 25; // Spring Balance — low stock
  return {
    productId: p.id,
    quantityAvailable: qty,
    quantityReserved: Math.floor(Math.random() * Math.min(qty, 50)),
    warehouse: "main",
  };
});
db.insert(schema.inventory).values(inventoryData).run();
console.log(`Seeded ${inventoryData.length} inventory records`);

// Seed customer-specific pricing (some customers get discounts)
const pricingData = [
  // Acme gets volume discounts on windows
  ...insertedProducts
    .filter((p) => p.category === "windows")
    .map((p) => ({
      customerId: insertedCustomers[0]!.id,
      productId: p.id,
      customPrice: null,
      discountPct: 12,
    })),
  // Pacific Coast gets custom prices on glass
  ...insertedProducts
    .filter((p) => p.category === "glass")
    .map((p) => ({
      customerId: insertedCustomers[1]!.id,
      productId: p.id,
      customPrice: Math.round(p.unitPrice * 0.85 * 100) / 100,
      discountPct: null,
    })),
  // Heartland gets 8% across the board
  ...insertedProducts.slice(0, 15).map((p) => ({
    customerId: insertedCustomers[2]!.id,
    productId: p.id,
    customPrice: null,
    discountPct: 8,
  })),
  // Cascade gets 10% on doors
  ...insertedProducts
    .filter((p) => p.category === "doors")
    .map((p) => ({
      customerId: insertedCustomers[8]!.id,
      productId: p.id,
      customPrice: null,
      discountPct: 10,
    })),
  // Lone Star gets custom pricing on hardware
  ...insertedProducts
    .filter((p) => p.category === "hardware")
    .map((p) => ({
      customerId: insertedCustomers[9]!.id,
      productId: p.id,
      customPrice: Math.round(p.unitPrice * 0.88 * 100) / 100,
      discountPct: null,
    })),
];
db.insert(schema.customerPrices).values(pricingData).run();
console.log(`Seeded ${pricingData.length} customer price overrides`);

// Seed users (password: demo1234)
const demoPasswordHash = hashSync("demo1234");
const userData: {
  customerId: number;
  email: string;
  passwordHash: string;
  role: "customer" | "vendor" | "admin";
  status: "active" | "disabled";
  mustResetPassword: boolean;
  featureFlags: string;
  lastLoginAt: string | null;
  updatedAt: string;
}[] = insertedCustomers.map((c) => ({
  customerId: c.id,
  email: c.contactEmail,
  passwordHash: demoPasswordHash,
  role:
    c.accountType === "vendor" ? ("vendor" as const) : ("customer" as const),
  status: "active" as const,
  mustResetPassword: false,
  featureFlags: JSON.stringify([
    "voice_assistant",
    "video_assistant",
    "agentic_mode",
  ]),
  lastLoginAt: null,
  updatedAt: new Date().toISOString(),
}));
// Add admin user linked to first customer
userData.push({
  customerId: insertedCustomers[0]!.id,
  email: "admin@autochain.io",
  passwordHash: demoPasswordHash,
  role: "admin" as const,
  status: "active" as const,
  mustResetPassword: false,
  featureFlags: JSON.stringify([
    "voice_assistant",
    "video_assistant",
    "agentic_mode",
    "admin_ai",
  ]),
  lastLoginAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const insertedUsers = db
  .insert(schema.users)
  .values(userData)
  .returning()
  .all();
console.log(`Seeded ${insertedUsers.length} users (password: demo1234)`);

// Helper: date N days ago
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

const userByEmail = new Map(insertedUsers.map((user) => [user.email, user]));

const seededSessionData = [
  {
    email: "orders@acmewindows.com",
    mode: "text" as const,
    autonomy: "manual" as const,
    lastSeenAt: hoursAgo(2),
    ipAddress: "10.0.0.21",
    userAgent: "Chrome on macOS",
  },
  {
    email: "purchasing@pacificglaze.com",
    mode: "voice" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(6),
    ipAddress: "10.0.0.34",
    userAgent: "Safari on iPhone",
  },
  {
    email: "supply@heartlandfen.com",
    mode: "video" as const,
    autonomy: "manual" as const,
    lastSeenAt: hoursAgo(10),
    ipAddress: "10.0.0.48",
    userAgent: "Edge on Windows",
  },
  {
    email: "ops@neglass.com",
    mode: "text" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(18),
    ipAddress: "10.0.0.57",
    userAgent: "Chrome on Android",
  },
  {
    email: "orders@sunbeltbp.com",
    mode: "agentic" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(4),
    ipAddress: "10.0.0.62",
    userAgent: "Chrome on macOS",
  },
  {
    email: "admin@autochain.io",
    mode: "agentic" as const,
    autonomy: "agent" as const,
    lastSeenAt: hoursAgo(1),
    ipAddress: "10.0.0.5",
    userAgent: "Arc on macOS",
  },
  {
    email: "ops@northstarextrusions.com",
    mode: "text" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(3),
    ipAddress: "10.0.1.11",
    userAgent: "Chrome on Windows",
  },
  {
    email: "ops@bluepeakglass.com",
    mode: "voice" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(7),
    ipAddress: "10.0.1.18",
    userAgent: "Safari on iPad",
  },
  {
    email: "ops@redriverhardware.com",
    mode: "agentic" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(9),
    ipAddress: "10.0.1.25",
    userAgent: "Chrome on macOS",
  },
  {
    email: "orders@cascadefen.com",
    mode: "text" as const,
    autonomy: "manual" as const,
    lastSeenAt: hoursAgo(5),
    ipAddress: "10.0.0.71",
    userAgent: "Firefox on Linux",
  },
  {
    email: "purchasing@lonestardoors.com",
    mode: "voice" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(4),
    ipAddress: "10.0.0.78",
    userAgent: "Chrome on Windows",
  },
  {
    email: "ops@summitseal.com",
    mode: "text" as const,
    autonomy: "manual" as const,
    lastSeenAt: hoursAgo(8),
    ipAddress: "10.0.1.32",
    userAgent: "Safari on macOS",
  },
  {
    email: "ops@prairietrim.com",
    mode: "agentic" as const,
    autonomy: "ask" as const,
    lastSeenAt: hoursAgo(6),
    ipAddress: "10.0.1.40",
    userAgent: "Edge on Windows",
  },
];

const insertedSessions = db
  .insert(schema.userSessions)
  .values(
    seededSessionData.map((session, index) => {
      const user = userByEmail.get(session.email);
      if (!user) {
        throw new Error(`Expected seeded user ${session.email}`);
      }

      return {
        userId: user.id,
        customerId: user.customerId,
        role: user.role,
        sessionToken: `seed-session-${index + 1}-${user.id}`,
        mode: session.mode,
        autonomy: session.autonomy,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        lastSeenAt: session.lastSeenAt,
        expiresAt: daysFromNow(7),
        createdAt: session.lastSeenAt,
      };
    }),
  )
  .returning()
  .all();

for (const session of insertedSessions) {
  db.update(schema.users)
    .set({
      lastLoginAt: session.lastSeenAt,
      updatedAt: session.lastSeenAt,
    })
    .where(eq(schema.users.id, session.userId))
    .run();
}

db.insert(schema.auditLogs)
  .values([
    {
      actorRole: "system",
      action: "seed.initialize",
      entityType: "environment",
      entityId: "autochain-demo",
      details: JSON.stringify({
        customers: insertedCustomers.length,
        users: insertedUsers.length,
      }),
      createdAt: daysAgo(2),
    },
    ...insertedSessions.map((session) => ({
      actorUserId: session.userId,
      actorRole: session.role,
      customerId: session.customerId,
      targetUserId: session.userId,
      sessionId: session.id,
      action: "auth.login",
      entityType: "session",
      entityId: String(session.id),
      details: JSON.stringify({
        mode: session.mode,
        autonomy: session.autonomy,
        seeded: true,
      }),
      createdAt: session.lastSeenAt,
    })),
  ])
  .run();

function trackingNumber(orderId: number): string {
  return `EVOSEED${String(orderId).padStart(5, "0")}`;
}

function shipmentEvents(baseDate: string, delivered = false) {
  const created = new Date(baseDate);
  const inTransit = new Date(created);
  inTransit.setDate(inTransit.getDate() + 1);
  const deliveredAt = new Date(created);
  deliveredAt.setDate(deliveredAt.getDate() + 4);

  const events = [
    {
      status: "created",
      description: "Shipment label created",
      location: "Dallas, TX",
      timestamp: created.toISOString(),
    },
    {
      status: "in_transit",
      description: "Package departed origin facility",
      location: "Dallas, TX",
      timestamp: inTransit.toISOString(),
    },
  ];

  if (delivered) {
    events.push({
      status: "delivered",
      description: "Shipment delivered to destination",
      location: "Customer site",
      timestamp: deliveredAt.toISOString(),
    });
  }

  return events;
}

// Seed orders — lots of data for Acme Windows (demo account) to populate dashboards
const orderSeed = [
  // === Acme Windows (customer 0) — 10 orders with full lifecycle ===
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0001",
    status: "delivered" as const,
    createdAt: daysAgo(90),
    lines: [
      { productIdx: 0, qty: 120 },
      { productIdx: 5, qty: 80 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0002",
    status: "delivered" as const,
    createdAt: daysAgo(75),
    lines: [
      { productIdx: 7, qty: 24 },
      { productIdx: 12, qty: 48 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0003",
    status: "delivered" as const,
    createdAt: daysAgo(60),
    lines: [
      { productIdx: 2, qty: 36 },
      { productIdx: 14, qty: 200 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0004",
    status: "delivered" as const,
    createdAt: daysAgo(45),
    lines: [
      { productIdx: 1, qty: 80 },
      { productIdx: 13, qty: 60 },
      { productIdx: 22, qty: 100 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0005",
    status: "shipped" as const,
    createdAt: daysAgo(20),
    lines: [
      { productIdx: 0, qty: 150 },
      { productIdx: 5, qty: 100 },
      { productIdx: 18, qty: 50 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0006",
    status: "shipped" as const,
    createdAt: daysAgo(14),
    lines: [
      { productIdx: 3, qty: 40 },
      { productIdx: 15, qty: 120 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0007",
    status: "processing" as const,
    createdAt: daysAgo(7),
    lines: [
      { productIdx: 6, qty: 8 },
      { productIdx: 8, qty: 6 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0008",
    status: "confirmed" as const,
    createdAt: daysAgo(3),
    lines: [
      { productIdx: 9, qty: 4 },
      { productIdx: 10, qty: 2 },
    ],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0009",
    status: "confirmed" as const,
    createdAt: daysAgo(1),
    lines: [{ productIdx: 4, qty: 20 }],
  },
  {
    customerId: insertedCustomers[0]!.id,
    orderNumber: "ESP-2026-0010",
    status: "draft" as const,
    createdAt: daysAgo(0),
    lines: [
      { productIdx: 29, qty: 50 },
      { productIdx: 30, qty: 30 },
    ],
  },

  // === Pacific Coast Glazing (customer 1) ===
  {
    customerId: insertedCustomers[1]!.id,
    orderNumber: "ESP-2026-0011",
    status: "delivered" as const,
    createdAt: daysAgo(80),
    lines: [
      { productIdx: 18, qty: 200 },
      { productIdx: 19, qty: 150 },
    ],
  },
  {
    customerId: insertedCustomers[1]!.id,
    orderNumber: "ESP-2026-0012",
    status: "processing" as const,
    createdAt: daysAgo(10),
    lines: [{ productIdx: 20, qty: 100 }],
  },

  // === Heartland Fenestration (customer 2) ===
  {
    customerId: insertedCustomers[2]!.id,
    orderNumber: "ESP-2026-0013",
    status: "delivered" as const,
    createdAt: daysAgo(65),
    lines: [
      { productIdx: 0, qty: 60 },
      { productIdx: 3, qty: 40 },
      { productIdx: 12, qty: 100 },
    ],
  },
  {
    customerId: insertedCustomers[2]!.id,
    orderNumber: "ESP-2026-0014",
    status: "confirmed" as const,
    createdAt: daysAgo(5),
    lines: [
      { productIdx: 27, qty: 50 },
      { productIdx: 28, qty: 50 },
    ],
  },

  // === Northeast Glass (customer 3) ===
  {
    customerId: insertedCustomers[3]!.id,
    orderNumber: "ESP-2026-0015",
    status: "shipped" as const,
    createdAt: daysAgo(12),
    lines: [
      { productIdx: 6, qty: 12 },
      { productIdx: 8, qty: 8 },
    ],
  },

  // === SunBelt (customer 4) ===
  {
    customerId: insertedCustomers[4]!.id,
    orderNumber: "ESP-2026-0016",
    status: "draft" as const,
    createdAt: daysAgo(2),
    lines: [
      { productIdx: 9, qty: 16 },
      { productIdx: 15, qty: 64 },
    ],
  },

  // === Mountain View (customer 5) ===
  {
    customerId: insertedCustomers[5]!.id,
    orderNumber: "ESP-2026-0017",
    status: "delivered" as const,
    createdAt: daysAgo(50),
    lines: [
      { productIdx: 1, qty: 200 },
      { productIdx: 14, qty: 300 },
    ],
  },

  // === Great Lakes Window (customer 6) ===
  {
    customerId: insertedCustomers[6]!.id,
    orderNumber: "ESP-2026-0018",
    status: "delivered" as const,
    createdAt: daysAgo(70),
    lines: [
      { productIdx: 0, qty: 90 },
      { productIdx: 2, qty: 45 },
      { productIdx: 18, qty: 60 },
    ],
  },
  {
    customerId: insertedCustomers[6]!.id,
    orderNumber: "ESP-2026-0019",
    status: "shipped" as const,
    createdAt: daysAgo(8),
    lines: [
      { productIdx: 6, qty: 6 },
      { productIdx: 13, qty: 40 },
    ],
  },
  {
    customerId: insertedCustomers[6]!.id,
    orderNumber: "ESP-2026-0020",
    status: "confirmed" as const,
    createdAt: daysAgo(2),
    lines: [{ productIdx: 4, qty: 15 }],
  },

  // === Southeastern Architectural (customer 7) ===
  {
    customerId: insertedCustomers[7]!.id,
    orderNumber: "ESP-2026-0021",
    status: "delivered" as const,
    createdAt: daysAgo(55),
    lines: [
      { productIdx: 7, qty: 18 },
      { productIdx: 8, qty: 12 },
    ],
  },
  {
    customerId: insertedCustomers[7]!.id,
    orderNumber: "ESP-2026-0022",
    status: "processing" as const,
    createdAt: daysAgo(6),
    lines: [
      { productIdx: 20, qty: 80 },
      { productIdx: 21, qty: 60 },
    ],
  },

  // === Cascade Fenestration (customer 8) ===
  {
    customerId: insertedCustomers[8]!.id,
    orderNumber: "ESP-2026-0023",
    status: "delivered" as const,
    createdAt: daysAgo(40),
    lines: [
      { productIdx: 7, qty: 30 },
      { productIdx: 9, qty: 10 },
    ],
  },
  {
    customerId: insertedCustomers[8]!.id,
    orderNumber: "ESP-2026-0024",
    status: "shipped" as const,
    createdAt: daysAgo(10),
    lines: [
      { productIdx: 3, qty: 50 },
      { productIdx: 5, qty: 70 },
    ],
  },
  {
    customerId: insertedCustomers[8]!.id,
    orderNumber: "ESP-2026-0025",
    status: "draft" as const,
    createdAt: daysAgo(1),
    lines: [
      { productIdx: 10, qty: 4 },
      { productIdx: 11, qty: 8 },
    ],
  },

  // === Lone Star Door Systems (customer 9) ===
  {
    customerId: insertedCustomers[9]!.id,
    orderNumber: "ESP-2026-0026",
    status: "delivered" as const,
    createdAt: daysAgo(60),
    lines: [
      { productIdx: 8, qty: 20 },
      { productIdx: 9, qty: 14 },
      { productIdx: 15, qty: 80 },
    ],
  },
  {
    customerId: insertedCustomers[9]!.id,
    orderNumber: "ESP-2026-0027",
    status: "shipped" as const,
    createdAt: daysAgo(12),
    lines: [
      { productIdx: 7, qty: 16 },
      { productIdx: 12, qty: 60 },
    ],
  },
  {
    customerId: insertedCustomers[9]!.id,
    orderNumber: "ESP-2026-0028",
    status: "confirmed" as const,
    createdAt: daysAgo(3),
    lines: [
      { productIdx: 10, qty: 6 },
      { productIdx: 16, qty: 100 },
    ],
  },
];

let invoiceCount = 0;
let shipmentCount = 0;
let ediCount = 0;
const orderIdByNumber = new Map<string, number>();
for (const o of orderSeed) {
  let total = 0;
  const lines = o.lines.map((l) => {
    const product = insertedProducts[l.productIdx]!;
    const lineTotal = product.unitPrice * l.qty;
    total += lineTotal;
    return {
      productId: product.id,
      quantity: l.qty,
      unitPrice: product.unitPrice,
      lineTotal,
    };
  });

  const [inserted] = db
    .insert(schema.orders)
    .values({
      customerId: o.customerId,
      orderNumber: o.orderNumber,
      status: o.status,
      total,
      createdAt: o.createdAt,
      updatedAt: o.createdAt,
    })
    .returning()
    .all();
  orderIdByNumber.set(o.orderNumber, inserted!.id);

  db.insert(schema.orderLines)
    .values(lines.map((l) => ({ ...l, orderId: inserted!.id })))
    .run();

  // Generate outbound EDI 850 for confirmed+ lifecycle stages
  if (
    o.status === "confirmed" ||
    o.status === "processing" ||
    o.status === "shipped" ||
    o.status === "delivered"
  ) {
    db.insert(schema.ediTransactions)
      .values({
        orderId: inserted!.id,
        type: "850",
        direction: "outbound",
        payload: JSON.stringify({
          orderNumber: o.orderNumber,
          customerId: o.customerId,
          status: "confirmed",
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        }),
        status: "sent",
        createdAt: o.createdAt,
      })
      .run();
    ediCount++;
  }

  // Create invoices for shipped/delivered orders
  if (o.status === "shipped" || o.status === "delivered") {
    const eta = new Date(o.createdAt);
    eta.setDate(eta.getDate() + 5);

    db.insert(schema.shipments)
      .values({
        orderId: inserted!.id,
        carrier: "UPS Freight",
        trackingNumber: trackingNumber(inserted!.id),
        status: o.status === "delivered" ? "delivered" : "in_transit",
        estimatedDelivery: eta.toISOString().split("T")[0]!,
        events: JSON.stringify(
          shipmentEvents(o.createdAt, o.status === "delivered"),
        ),
        createdAt: o.createdAt,
      })
      .run();
    shipmentCount++;

    db.insert(schema.ediTransactions)
      .values({
        orderId: inserted!.id,
        type: "856",
        direction: "outbound",
        payload: JSON.stringify({
          orderNumber: o.orderNumber,
          customerId: o.customerId,
          status: "shipped",
          trackingNumber: trackingNumber(inserted!.id),
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        }),
        status: "sent",
        createdAt: o.createdAt,
      })
      .run();
    ediCount++;

    const orderDate = new Date(o.createdAt);
    const dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Determine invoice status based on dates
    const now = new Date();
    let invoiceStatus: "paid" | "pending" | "overdue";
    let paidAt: string | null = null;

    if (o.status === "delivered") {
      // Older delivered orders are paid, recent ones may be overdue
      const daysSinceOrder =
        (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceOrder > 35) {
        // Old enough — mark as paid
        invoiceStatus = "paid";
        const payDate = new Date(dueDate);
        payDate.setDate(payDate.getDate() - 5);
        paidAt = payDate.toISOString();
      } else if (dueDate < now) {
        // Past due but not paid
        invoiceStatus = "overdue";
      } else {
        invoiceStatus = "pending";
      }
    } else {
      // shipped — pending or overdue
      invoiceStatus = dueDate < now ? "overdue" : "pending";
    }

    db.insert(schema.invoices)
      .values({
        orderId: inserted!.id,
        customerId: o.customerId,
        invoiceNumber: o.orderNumber.replace("ESP-", "INV-"),
        amount: total,
        status: invoiceStatus,
        dueDate: dueDate.toISOString().split("T")[0]!,
        paidAt,
        createdAt: o.createdAt,
      })
      .run();
    invoiceCount++;
  }
}
// Add standalone overdue invoices for Acme (simulating late payments)
const orderId0003 = orderIdByNumber.get("ESP-2026-0003");
const orderId0004 = orderIdByNumber.get("ESP-2026-0004");
if (!orderId0003 || !orderId0004) {
  throw new Error("Expected seeded orders ESP-2026-0003 and ESP-2026-0004");
}

const overdueInvoices = [
  {
    orderId: orderId0003,
    customerId: insertedCustomers[0]!.id,
    invoiceNumber: "INV-2026-0003-B",
    amount: 4800.0,
    status: "overdue" as const,
    dueDate: daysAgo(15).split("T")[0]!,
    paidAt: null,
    createdAt: daysAgo(50),
  },
  {
    orderId: orderId0004,
    customerId: insertedCustomers[0]!.id,
    invoiceNumber: "INV-2026-0004-B",
    amount: 7600.0,
    status: "overdue" as const,
    dueDate: daysAgo(5).split("T")[0]!,
    paidAt: null,
    createdAt: daysAgo(40),
  },
];
db.insert(schema.invoices).values(overdueInvoices).run();
invoiceCount += overdueInvoices.length;

const acmeUser = userByEmail.get("orders@acmewindows.com");
const adminUser = userByEmail.get("admin@autochain.io");
const northStarUser = userByEmail.get("ops@northstarextrusions.com");
const bluePeakUser = userByEmail.get("ops@bluepeakglass.com");
const redRiverUser = userByEmail.get("ops@redriverhardware.com");
const summitUser = userByEmail.get("ops@summitseal.com");
const prairieUser = userByEmail.get("ops@prairietrim.com");
const cascadeUser = userByEmail.get("orders@cascadefen.com");
const loneStarUser = userByEmail.get("purchasing@lonestardoors.com");
const greatLakesUser = userByEmail.get("procurement@greatlakeswin.com");
const southeasternUser = userByEmail.get("sales@seaglass.com");

if (
  !acmeUser ||
  !adminUser ||
  !northStarUser ||
  !bluePeakUser ||
  !redRiverUser ||
  !summitUser ||
  !prairieUser ||
  !cascadeUser ||
  !loneStarUser ||
  !greatLakesUser ||
  !southeasternUser
) {
  throw new Error("Expected seeded client, vendor, and admin users");
}

const northStarAccount = insertedCustomers.find(
  (customer) => customer.accountNumber === "VND-101",
);
const bluePeakAccount = insertedCustomers.find(
  (customer) => customer.accountNumber === "VND-102",
);
const redRiverAccount = insertedCustomers.find(
  (customer) => customer.accountNumber === "VND-103",
);
const summitAccount = insertedCustomers.find(
  (customer) => customer.accountNumber === "VND-104",
);
const prairieAccount = insertedCustomers.find(
  (customer) => customer.accountNumber === "VND-105",
);

if (
  !northStarAccount ||
  !bluePeakAccount ||
  !redRiverAccount ||
  !summitAccount ||
  !prairieAccount
) {
  throw new Error("Expected seeded vendor accounts");
}

db.insert(schema.vendorProfiles)
  .values([
    {
      customerId: northStarAccount.id,
      vendorCode: "NSE-01",
      categoryFocus: "frames, weatherstripping",
      paymentTerms: "Net 30",
      leadTimeDays: 14,
      reliabilityScore: 94,
      preferredShippingMethod: "LTL freight",
      operationsEmail: northStarUser.email,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(2),
    },
    {
      customerId: bluePeakAccount.id,
      vendorCode: "BPG-02",
      categoryFocus: "glass, insulated units",
      paymentTerms: "Net 45",
      leadTimeDays: 18,
      reliabilityScore: 91,
      preferredShippingMethod: "Dedicated carrier",
      operationsEmail: bluePeakUser.email,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(2),
    },
    {
      customerId: redRiverAccount.id,
      vendorCode: "RRH-03",
      categoryFocus: "hardware, lock assemblies",
      paymentTerms: "Net 30",
      leadTimeDays: 10,
      reliabilityScore: 88,
      preferredShippingMethod: "Parcel",
      operationsEmail: redRiverUser.email,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(1),
    },
    {
      customerId: summitAccount.id,
      vendorCode: "SSG-04",
      categoryFocus: "weatherstripping, seals, gaskets",
      paymentTerms: "Net 30",
      leadTimeDays: 7,
      reliabilityScore: 96,
      preferredShippingMethod: "Parcel",
      operationsEmail: summitUser.email,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(1),
    },
    {
      customerId: prairieAccount.id,
      vendorCode: "PAT-05",
      categoryFocus: "accessories, trim, screens",
      paymentTerms: "Net 45",
      leadTimeDays: 12,
      reliabilityScore: 85,
      preferredShippingMethod: "LTL freight",
      operationsEmail: prairieUser.email,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(2),
    },
  ])
  .run();

const productBySku = new Map(
  insertedProducts.map((product) => [product.sku, product]),
);

db.insert(schema.vendorCatalogItems)
  .values([
    {
      vendorCustomerId: northStarAccount.id,
      productId: productBySku.get("FRM-VNL-WHT")!.id,
      vendorSku: "NSE-FRM-WHT-20",
      unitCost: 34,
      minimumOrderQty: 20,
      leadTimeDays: 14,
      availableQty: 420,
      status: "active",
      createdAt: daysAgo(14),
      updatedAt: daysAgo(2),
    },
    {
      vendorCustomerId: northStarAccount.id,
      productId: productBySku.get("WTH-PIL-WOV")!.id,
      vendorSku: "NSE-WTH-WOV-100",
      unitCost: 18.75,
      minimumOrderQty: 50,
      leadTimeDays: 9,
      availableQty: 24,
      status: "constrained",
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
    },
    {
      vendorCustomerId: bluePeakAccount.id,
      productId: productBySku.get("GLS-LOW-E2")!.id,
      vendorSku: "BPG-IGU-LE2",
      unitCost: 89,
      minimumOrderQty: 30,
      leadTimeDays: 18,
      availableQty: 160,
      status: "active",
      createdAt: daysAgo(14),
      updatedAt: daysAgo(2),
    },
    {
      vendorCustomerId: bluePeakAccount.id,
      productId: productBySku.get("GLS-LOW-E3")!.id,
      vendorSku: "BPG-IGU-LE3",
      unitCost: 156,
      minimumOrderQty: 20,
      leadTimeDays: 22,
      availableQty: 18,
      status: "constrained",
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
    },
    {
      vendorCustomerId: redRiverAccount.id,
      productId: productBySku.get("HDW-LCK-SLD")!.id,
      vendorSku: "RRH-LCK-SLD",
      unitCost: 27,
      minimumOrderQty: 100,
      leadTimeDays: 8,
      availableQty: 700,
      status: "active",
      createdAt: daysAgo(14),
      updatedAt: daysAgo(3),
    },
    {
      vendorCustomerId: redRiverAccount.id,
      productId: productBySku.get("HDW-CRK-OPR")!.id,
      vendorSku: "RRH-CRK-OPR",
      unitCost: 16.5,
      minimumOrderQty: 120,
      leadTimeDays: 12,
      availableQty: 42,
      status: "constrained",
      createdAt: daysAgo(14),
      updatedAt: hoursAgo(12),
    },
    {
      vendorCustomerId: summitAccount.id,
      productId: productBySku.get("WTH-BLB-EPD")!.id,
      vendorSku: "SSG-BLB-EPD-50",
      unitCost: 28,
      minimumOrderQty: 40,
      leadTimeDays: 7,
      availableQty: 320,
      status: "active",
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
    },
    {
      vendorCustomerId: summitAccount.id,
      productId: productBySku.get("WTH-FIN-BLK")!.id,
      vendorSku: "SSG-FIN-BLK-100",
      unitCost: 22,
      minimumOrderQty: 60,
      leadTimeDays: 5,
      availableQty: 500,
      status: "active",
      createdAt: daysAgo(12),
      updatedAt: daysAgo(2),
    },
    {
      vendorCustomerId: prairieAccount.id,
      productId: productBySku.get("ACC-SCR-RET")!.id,
      vendorSku: "PAT-SCR-RET",
      unitCost: 42,
      minimumOrderQty: 25,
      leadTimeDays: 12,
      availableQty: 85,
      status: "active",
      createdAt: daysAgo(10),
      updatedAt: daysAgo(2),
    },
    {
      vendorCustomerId: prairieAccount.id,
      productId: productBySku.get("ACC-TRM-INT")!.id,
      vendorSku: "PAT-TRM-INT",
      unitCost: 28,
      minimumOrderQty: 30,
      leadTimeDays: 10,
      availableQty: 12,
      status: "constrained",
      createdAt: daysAgo(10),
      updatedAt: hoursAgo(18),
    },
  ])
  .run();

const purchaseOrderSeed = [
  {
    vendorCustomerId: northStarAccount.id,
    issuedByUserId: adminUser.id,
    purchaseOrderNumber: "PO-2026-2001",
    status: "confirmed" as const,
    expectedShipDate: daysFromNow(5).split("T")[0]!,
    createdAt: daysAgo(6),
    updatedAt: hoursAgo(18),
    lines: [
      { sku: "FRM-VNL-WHT", quantity: 80, unitCost: 34 },
      { sku: "WTH-PIL-WOV", quantity: 120, unitCost: 18.75 },
    ],
  },
  {
    vendorCustomerId: bluePeakAccount.id,
    issuedByUserId: adminUser.id,
    purchaseOrderNumber: "PO-2026-2002",
    status: "in_production" as const,
    expectedShipDate: daysFromNow(9).split("T")[0]!,
    createdAt: daysAgo(8),
    updatedAt: hoursAgo(30),
    lines: [
      { sku: "GLS-LOW-E2", quantity: 60, unitCost: 89 },
      { sku: "GLS-LOW-E3", quantity: 24, unitCost: 156 },
    ],
  },
  {
    vendorCustomerId: redRiverAccount.id,
    issuedByUserId: adminUser.id,
    purchaseOrderNumber: "PO-2026-2003",
    status: "shipped" as const,
    expectedShipDate: daysFromNow(2).split("T")[0]!,
    createdAt: daysAgo(10),
    updatedAt: hoursAgo(42),
    lines: [
      { sku: "HDW-LCK-SLD", quantity: 300, unitCost: 27 },
      { sku: "HDW-CRK-OPR", quantity: 240, unitCost: 16.5 },
    ],
  },
  {
    vendorCustomerId: summitAccount.id,
    issuedByUserId: adminUser.id,
    purchaseOrderNumber: "PO-2026-2004",
    status: "confirmed" as const,
    expectedShipDate: daysFromNow(4).split("T")[0]!,
    createdAt: daysAgo(5),
    updatedAt: hoursAgo(12),
    lines: [
      { sku: "WTH-BLB-EPD", quantity: 200, unitCost: 28 },
      { sku: "WTH-FIN-BLK", quantity: 300, unitCost: 22 },
    ],
  },
  {
    vendorCustomerId: prairieAccount.id,
    issuedByUserId: adminUser.id,
    purchaseOrderNumber: "PO-2026-2005",
    status: "shipped" as const,
    expectedShipDate: daysFromNow(1).split("T")[0]!,
    createdAt: daysAgo(9),
    updatedAt: hoursAgo(20),
    lines: [
      { sku: "ACC-SCR-RET", quantity: 50, unitCost: 42 },
      { sku: "ACC-TRM-INT", quantity: 80, unitCost: 28 },
    ],
  },
];

const insertedPurchaseOrders = db
  .insert(schema.purchaseOrders)
  .values(
    purchaseOrderSeed.map((record) => {
      const total = record.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitCost,
        0,
      );
      return {
        vendorCustomerId: record.vendorCustomerId,
        issuedByUserId: record.issuedByUserId,
        purchaseOrderNumber: record.purchaseOrderNumber,
        status: record.status,
        expectedShipDate: record.expectedShipDate,
        total,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    }),
  )
  .returning()
  .all();

const purchaseOrderByNumber = new Map(
  insertedPurchaseOrders.map((record) => [record.purchaseOrderNumber, record]),
);

db.insert(schema.purchaseOrderLines)
  .values(
    purchaseOrderSeed.flatMap((record) =>
      record.lines.map((line) => ({
        purchaseOrderId: purchaseOrderByNumber.get(record.purchaseOrderNumber)!
          .id,
        productId: productBySku.get(line.sku)!.id,
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineTotal: line.quantity * line.unitCost,
      })),
    ),
  )
  .run();

db.insert(schema.vendorShipments)
  .values([
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2002")!.id,
      carrier: "BluePeak Fleet",
      trackingNumber: "VSHIP-BPG-2002",
      status: "pending",
      estimatedDelivery: daysFromNow(11).split("T")[0]!,
      events: JSON.stringify([
        {
          status: "scheduled",
          description: "Production slot confirmed for insulating glass batch",
          timestamp: hoursAgo(30),
        },
      ]),
      createdAt: hoursAgo(30),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2003")!.id,
      carrier: "FedEx Freight",
      trackingNumber: "VSHIP-RRH-2003",
      status: "in_transit",
      estimatedDelivery: daysFromNow(2).split("T")[0]!,
      events: JSON.stringify([
        {
          status: "picked_up",
          description: "Shipment picked up from Memphis dock",
          timestamp: hoursAgo(24),
        },
        {
          status: "in_transit",
          description: "Linehaul departed Memphis hub",
          timestamp: hoursAgo(12),
        },
      ]),
      createdAt: hoursAgo(24),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2004")!.id,
      carrier: "Summit Direct",
      trackingNumber: "VSHIP-SSG-2004",
      status: "pending",
      estimatedDelivery: daysFromNow(5).split("T")[0]!,
      events: JSON.stringify([
        {
          status: "scheduled",
          description: "Seal and gasket batch confirmed for packing",
          timestamp: hoursAgo(10),
        },
      ]),
      createdAt: hoursAgo(10),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2005")!.id,
      carrier: "UPS Freight",
      trackingNumber: "VSHIP-PAT-2005",
      status: "in_transit",
      estimatedDelivery: daysFromNow(1).split("T")[0]!,
      events: JSON.stringify([
        {
          status: "picked_up",
          description: "Pallets picked up from Kansas City warehouse",
          timestamp: hoursAgo(36),
        },
        {
          status: "in_transit",
          description: "In transit via regional hub",
          timestamp: hoursAgo(18),
        },
      ]),
      createdAt: hoursAgo(36),
    },
  ])
  .run();

db.insert(schema.vendorInvoices)
  .values([
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2001")!.id,
      vendorCustomerId: northStarAccount.id,
      invoiceNumber: "INV-V-2026-2001",
      amount: 4970,
      status: "approved",
      dueDate: daysFromNow(12).split("T")[0]!,
      paidAt: null,
      createdAt: daysAgo(2),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2002")!.id,
      vendorCustomerId: bluePeakAccount.id,
      invoiceNumber: "INV-V-2026-2002",
      amount: 9072,
      status: "pending",
      dueDate: daysFromNow(18).split("T")[0]!,
      paidAt: null,
      createdAt: daysAgo(1),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2003")!.id,
      vendorCustomerId: redRiverAccount.id,
      invoiceNumber: "INV-V-2026-2003",
      amount: 12060,
      status: "disputed",
      dueDate: daysFromNow(7).split("T")[0]!,
      paidAt: null,
      createdAt: daysAgo(3),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2004")!.id,
      vendorCustomerId: summitAccount.id,
      invoiceNumber: "INV-V-2026-2004",
      amount: 12200,
      status: "pending",
      dueDate: daysFromNow(14).split("T")[0]!,
      paidAt: null,
      createdAt: daysAgo(1),
    },
    {
      purchaseOrderId: purchaseOrderByNumber.get("PO-2026-2005")!.id,
      vendorCustomerId: prairieAccount.id,
      invoiceNumber: "INV-V-2026-2005",
      amount: 4340,
      status: "approved",
      dueDate: daysFromNow(10).split("T")[0]!,
      paidAt: null,
      createdAt: daysAgo(2),
    },
  ])
  .run();

const seededDocuments = db
  .insert(schema.documents)
  .values([
    {
      customerId: insertedCustomers[0]!.id,
      ownerUserId: acmeUser.id,
      kind: "report",
      title: "Monthly Summary",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      customerId: insertedCustomers[0]!.id,
      ownerUserId: adminUser.id,
      kind: "agreement",
      title: "Preferred Distributor Agreement",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
    {
      customerId: northStarAccount.id,
      ownerUserId: northStarUser.id,
      kind: "report",
      title: "Vendor Constraint Watch",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      customerId: insertedCustomers[1]!.id,
      ownerUserId: userByEmail.get("purchasing@pacificglaze.com")!.id,
      kind: "invoice",
      title: "Glass Order Reconciliation",
      status: "published",
      currentVersionNumber: 1,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(4),
    },
    {
      customerId: insertedCustomers[6]!.id,
      ownerUserId: greatLakesUser.id,
      kind: "report",
      title: "Q1 Window Procurement Review",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
    {
      customerId: insertedCustomers[8]!.id,
      ownerUserId: cascadeUser.id,
      kind: "brief",
      title: "New Account Onboarding Brief",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      customerId: insertedCustomers[9]!.id,
      ownerUserId: loneStarUser.id,
      kind: "agreement",
      title: "Volume Pricing Agreement Draft",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(4),
      updatedAt: daysAgo(3),
    },
    {
      customerId: bluePeakAccount.id,
      ownerUserId: bluePeakUser.id,
      kind: "report",
      title: "Insulated Glass Production Forecast",
      status: "published",
      currentVersionNumber: 1,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(5),
    },
    {
      customerId: summitAccount.id,
      ownerUserId: summitUser.id,
      kind: "brief",
      title: "Seal Product Line Overview",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },
    {
      customerId: prairieAccount.id,
      ownerUserId: prairieUser.id,
      kind: "report",
      title: "Trim Kit Availability Report",
      status: "draft",
      currentVersionNumber: 1,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  ])
  .returning()
  .all();

db.insert(schema.documentVersions)
  .values([
    {
      documentId: seededDocuments[0]!.id,
      versionNumber: 1,
      title: "Monthly Summary",
      contentMarkdown:
        "# Monthly Summary\n\n## Snapshot\n\n- 10 recent orders reviewed\n- Outstanding balance remains elevated\n- Shipment tracking requires follow-up on two lanes",
      metadata: JSON.stringify({ seeded: true, template: "monthly_summary" }),
      filePath: null,
      createdByUserId: acmeUser.id,
      createdAt: daysAgo(1),
    },
    {
      documentId: seededDocuments[1]!.id,
      versionNumber: 1,
      title: "Preferred Distributor Agreement",
      contentMarkdown:
        "# Preferred Distributor Agreement\n\n## Scope\n\n- Draft commercial terms\n- Payment obligations\n- Delivery and connector audit conditions",
      metadata: JSON.stringify({ seeded: true, template: "agreement" }),
      filePath: null,
      createdByUserId: adminUser.id,
      createdAt: daysAgo(3),
    },
    {
      documentId: seededDocuments[2]!.id,
      versionNumber: 1,
      title: "Vendor Constraint Watch",
      contentMarkdown:
        "# Vendor Constraint Watch\n\n## Highlights\n\n- Woven pile strip supply remains constrained\n- One lock and operator shipment is in transit\n- One invoice dispute needs buyer follow-up",
      metadata: JSON.stringify({
        seeded: true,
        template: "vendor_catalog_health",
      }),
      filePath: null,
      createdByUserId: northStarUser.id,
      createdAt: daysAgo(2),
    },
    {
      documentId: seededDocuments[3]!.id,
      versionNumber: 1,
      title: "Glass Order Reconciliation",
      contentMarkdown:
        "# Glass Order Reconciliation\n\n## Summary\n\n- 350 IG units received across two deliveries\n- Pricing matched contract terms at 15% discount\n- One short-ship of 12 units pending credit",
      metadata: JSON.stringify({ seeded: true, template: "invoice_review" }),
      filePath: null,
      createdByUserId: userByEmail.get("purchasing@pacificglaze.com")!.id,
      createdAt: daysAgo(5),
    },
    {
      documentId: seededDocuments[4]!.id,
      versionNumber: 1,
      title: "Q1 Window Procurement Review",
      contentMarkdown:
        "# Q1 Window Procurement Review\n\n## Key Metrics\n\n- 135 window units ordered across 3 POs\n- Average lead time: 11 days\n- Bay window units on backorder — switch to casement recommended",
      metadata: JSON.stringify({ seeded: true, template: "quarterly_review" }),
      filePath: null,
      createdByUserId: greatLakesUser.id,
      createdAt: daysAgo(3),
    },
    {
      documentId: seededDocuments[5]!.id,
      versionNumber: 1,
      title: "New Account Onboarding Brief",
      contentMarkdown:
        "# Cascade Fenestration — Onboarding Brief\n\n## Account Setup\n\n- Primary contact: Derek Olsen\n- Focus: doors and sliding systems for Pacific Northwest market\n- Initial order placed, awaiting delivery confirmation",
      metadata: JSON.stringify({ seeded: true, template: "onboarding_brief" }),
      filePath: null,
      createdByUserId: cascadeUser.id,
      createdAt: daysAgo(2),
    },
    {
      documentId: seededDocuments[6]!.id,
      versionNumber: 1,
      title: "Volume Pricing Agreement Draft",
      contentMarkdown:
        "# Volume Pricing Agreement — Lone Star Door Systems\n\n## Terms\n\n- 12% discount on hardware above 500 units per quarter\n- Fixed pricing on entry and french doors through Q3\n- Payment terms: Net 30",
      metadata: JSON.stringify({ seeded: true, template: "agreement" }),
      filePath: null,
      createdByUserId: loneStarUser.id,
      createdAt: daysAgo(4),
    },
    {
      documentId: seededDocuments[7]!.id,
      versionNumber: 1,
      title: "Insulated Glass Production Forecast",
      contentMarkdown:
        "# BluePeak Glass — Production Forecast\n\n## Capacity\n\n- Current batch: 60 Low-E double pane + 24 triple pane\n- Lead time elevated to 22 days for triple pane\n- Furnace maintenance window scheduled for next month",
      metadata: JSON.stringify({
        seeded: true,
        template: "vendor_production_forecast",
      }),
      filePath: null,
      createdByUserId: bluePeakUser.id,
      createdAt: daysAgo(6),
    },
    {
      documentId: seededDocuments[8]!.id,
      versionNumber: 1,
      title: "Seal Product Line Overview",
      contentMarkdown:
        "# Summit Seal — Product Line Overview\n\n## Capabilities\n\n- EPDM bulb seals: high volume, 7-day lead\n- Fin seal weatherstrip: standard stock item\n- Custom gasket profiles available on 21-day lead",
      metadata: JSON.stringify({ seeded: true, template: "vendor_overview" }),
      filePath: null,
      createdByUserId: summitUser.id,
      createdAt: daysAgo(3),
    },
    {
      documentId: seededDocuments[9]!.id,
      versionNumber: 1,
      title: "Trim Kit Availability Report",
      contentMarkdown:
        "# Prairie Accessories — Trim Kit Availability\n\n## Status\n\n- Interior trim kits constrained — raw material backlog\n- Retractable screen kits available at standard lead\n- Flashing kit stock adequate through Q2",
      metadata: JSON.stringify({
        seeded: true,
        template: "vendor_availability",
      }),
      filePath: null,
      createdByUserId: prairieUser.id,
      createdAt: daysAgo(2),
    },
  ])
  .run();

db.insert(schema.memoryItems)
  .values([
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      workflowRunId: null,
      scope: "tenant",
      namespace: "ops_notes",
      title: "April payment watch",
      content:
        "Acme requested a consolidated overdue invoice review before next Friday.",
      metadata: JSON.stringify({ seeded: true }),
      sourceType: "seed",
      sourceId: "ops-note-1",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: adminUser.id,
      workflowRunId: null,
      scope: "tenant",
      namespace: "customer_health",
      title: "Risk observation",
      content:
        "Two overdue balances and one agentic session in ask mode should be reviewed.",
      metadata: JSON.stringify({ seeded: true }),
      sourceType: "seed",
      sourceId: "risk-note-1",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      customerId: northStarAccount.id,
      userId: northStarUser.id,
      workflowRunId: null,
      scope: "tenant",
      namespace: "vendor_constraints",
      title: "Pile strip constraint",
      content:
        "Woven pile strip lot is constrained until the next resin allocation clears. Lead time is currently nine days.",
      metadata: JSON.stringify({ seeded: true }),
      sourceType: "seed",
      sourceId: "vendor-note-1",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  ])
  .run();

db.insert(schema.connectorAccounts)
  .values([
    {
      customerId: insertedCustomers[0]!.id,
      provider: "gmail",
      accountIdentifier: "ops@acmewindows.com",
      status: "disconnected",
      scopes: JSON.stringify(["gmail.compose", "gmail.readonly"]),
      metadata: JSON.stringify({ seeded: true }),
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
    {
      customerId: northStarAccount.id,
      provider: "gmail",
      accountIdentifier: "ops@northstarextrusions.com",
      status: "connected",
      scopes: JSON.stringify(["gmail.compose"]),
      metadata: JSON.stringify({ seeded: true }),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
    },
    {
      customerId: summitAccount.id,
      provider: "gmail",
      accountIdentifier: "ops@summitseal.com",
      status: "connected",
      scopes: JSON.stringify(["gmail.compose", "gmail.readonly"]),
      metadata: JSON.stringify({ seeded: true }),
      createdAt: daysAgo(5),
      updatedAt: daysAgo(2),
    },
  ])
  .run();

const [seededWorkflow] = db
  .insert(schema.workflowRuns)
  .values({
    customerId: insertedCustomers[0]!.id,
    userId: adminUser.id,
    role: "admin",
    sessionId:
      insertedSessions.find((session) => session.userId === adminUser.id)?.id ??
      null,
    mode: "agentic",
    autonomy: "ask",
    sandbox: "app",
    task: "Check monthly reports and summarize.",
    status: "completed",
    currentStepIndex: 2,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    expiresAt: daysFromNow(7),
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  })
  .returning()
  .all();

const [workflowStep1, workflowStep2] = db
  .insert(schema.workflowSteps)
  .values([
    {
      runId: seededWorkflow!.id,
      stepNumber: 1,
      title: "Open the starting workspace",
      actionKey: "navigate.admin.dashboard",
      actionType: "navigate",
      target: "/admin/dashboard",
      payload: JSON.stringify({}),
      status: "completed",
      requiresApproval: false,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({ href: "/admin/dashboard" }),
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      runId: seededWorkflow!.id,
      stepNumber: 2,
      title: "Generate the monthly summary document",
      actionKey: "report.generate_monthly",
      actionType: "generate",
      target: "/documents",
      payload: JSON.stringify({
        documentKind: "report",
        template: "monthly_summary",
      }),
      status: "completed",
      requiresApproval: true,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({ documentId: seededDocuments[0]!.id }),
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  ])
  .returning()
  .all();

db.insert(schema.workflowEvents)
  .values([
    {
      runId: seededWorkflow!.id,
      stepId: null,
      eventType: "workflow.created",
      message: "Workflow created from task",
      data: JSON.stringify({ seeded: true }),
      createdAt: daysAgo(1),
    },
    {
      runId: seededWorkflow!.id,
      stepId: workflowStep1!.id,
      eventType: "step.completed",
      message: "Completed: Open the starting workspace",
      data: JSON.stringify({ href: "/admin/dashboard" }),
      createdAt: daysAgo(1),
    },
    {
      runId: seededWorkflow!.id,
      stepId: workflowStep2!.id,
      eventType: "step.completed",
      message: "Completed: Generate the monthly summary document",
      data: JSON.stringify({ documentId: seededDocuments[0]!.id }),
      createdAt: daysAgo(1),
    },
  ])
  .run();

db.insert(schema.workflowCheckpoints)
  .values([
    {
      runId: seededWorkflow!.id,
      stepId: workflowStep1!.id,
      checkpointKey: "navigation.completed",
      data: JSON.stringify({ href: "/admin/dashboard" }),
      createdAt: daysAgo(1),
    },
    {
      runId: seededWorkflow!.id,
      stepId: workflowStep2!.id,
      checkpointKey: "document.generated",
      data: JSON.stringify({ documentId: seededDocuments[0]!.id }),
      createdAt: daysAgo(1),
    },
  ])
  .run();

db.insert(schema.workflowArtifacts)
  .values([
    {
      runId: seededWorkflow!.id,
      stepId: workflowStep2!.id,
      kind: "document",
      title: "Monthly Summary",
      path: null,
      data: JSON.stringify({ documentId: seededDocuments[0]!.id }),
      createdAt: daysAgo(1),
    },
  ])
  .run();

const [pendingApprovalWorkflow] = db
  .insert(schema.workflowRuns)
  .values({
    customerId: insertedCustomers[0]!.id,
    userId: acmeUser.id,
    role: "customer",
    sessionId:
      insertedSessions.find((session) => session.userId === acmeUser.id)?.id ??
      null,
    mode: "agentic",
    autonomy: "ask",
    sandbox: "app",
    task: "Check unpaid invoices",
    status: "waiting_approval",
    currentStepIndex: 1,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    expiresAt: daysFromNow(5),
    createdAt: hoursAgo(8),
    updatedAt: hoursAgo(2),
  })
  .returning()
  .all();

const [pendingStep1, pendingStep2] = db
  .insert(schema.workflowSteps)
  .values([
    {
      runId: pendingApprovalWorkflow!.id,
      stepNumber: 1,
      title: "Open the invoices workspace",
      actionKey: "navigate.invoices",
      actionType: "navigate",
      target: "/invoices",
      payload: JSON.stringify({}),
      status: "completed",
      requiresApproval: false,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({ href: "/invoices" }),
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    },
    {
      runId: pendingApprovalWorkflow!.id,
      stepNumber: 2,
      title: "Generate an unpaid invoice review",
      actionKey: "report.check_overdue_invoices",
      actionType: "generate",
      target: "/documents",
      payload: JSON.stringify({
        documentKind: "invoice",
        template: "overdue_invoice_review",
      }),
      status: "pending",
      requiresApproval: true,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({}),
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    },
  ])
  .returning()
  .all();

db.insert(schema.workflowEvents)
  .values([
    {
      runId: pendingApprovalWorkflow!.id,
      stepId: null,
      eventType: "workflow.created",
      message: "Workflow created from assistant task",
      data: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(8),
    },
    {
      runId: pendingApprovalWorkflow!.id,
      stepId: pendingStep1!.id,
      eventType: "step.completed",
      message: "Completed: Open the invoices workspace",
      data: JSON.stringify({ href: "/invoices" }),
      createdAt: hoursAgo(2),
    },
    {
      runId: pendingApprovalWorkflow!.id,
      stepId: pendingStep2!.id,
      eventType: "step.waiting_approval",
      message:
        "Waiting for approval before generating the unpaid invoice review",
      data: JSON.stringify({ requiresApproval: true }),
      createdAt: hoursAgo(2),
    },
  ])
  .run();

db.insert(schema.workflowCheckpoints)
  .values([
    {
      runId: pendingApprovalWorkflow!.id,
      stepId: pendingStep1!.id,
      checkpointKey: "navigation.completed",
      data: JSON.stringify({ href: "/invoices" }),
      createdAt: hoursAgo(2),
    },
  ])
  .run();

const [vendorWorkflow] = db
  .insert(schema.workflowRuns)
  .values({
    customerId: redRiverAccount.id,
    userId: redRiverUser.id,
    role: "vendor",
    sessionId:
      insertedSessions.find((session) => session.userId === redRiverUser.id)
        ?.id ?? null,
    mode: "agentic",
    autonomy: "ask",
    sandbox: "app",
    task: "Review constrained catalog and summarize next actions",
    status: "waiting_approval",
    currentStepIndex: 1,
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    expiresAt: daysFromNow(5),
    createdAt: hoursAgo(7),
    updatedAt: hoursAgo(1),
  })
  .returning()
  .all();

const [vendorStep1, vendorStep2] = db
  .insert(schema.workflowSteps)
  .values([
    {
      runId: vendorWorkflow!.id,
      stepNumber: 1,
      title: "Open the vendor catalog",
      actionKey: "navigate.vendor.catalog",
      actionType: "navigate",
      target: "/vendor/catalog",
      payload: JSON.stringify({}),
      status: "completed",
      requiresApproval: false,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({ href: "/vendor/catalog" }),
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(1),
    },
    {
      runId: vendorWorkflow!.id,
      stepNumber: 2,
      title: "Generate vendor catalog availability and constraint review",
      actionKey: "report.vendor_catalog_health",
      actionType: "generate",
      target: "/documents",
      payload: JSON.stringify({
        documentKind: "report",
        template: "vendor_catalog_health",
      }),
      status: "pending",
      requiresApproval: true,
      retryCount: 0,
      maxRetries: 2,
      checkpointData: JSON.stringify({}),
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(1),
    },
  ])
  .returning()
  .all();

db.insert(schema.workflowEvents)
  .values([
    {
      runId: vendorWorkflow!.id,
      stepId: null,
      eventType: "workflow.created",
      message: "Vendor workflow created from assistant task",
      data: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(7),
    },
    {
      runId: vendorWorkflow!.id,
      stepId: vendorStep1!.id,
      eventType: "step.completed",
      message: "Completed: Open the vendor catalog",
      data: JSON.stringify({ href: "/vendor/catalog" }),
      createdAt: hoursAgo(1),
    },
    {
      runId: vendorWorkflow!.id,
      stepId: vendorStep2!.id,
      eventType: "step.waiting_approval",
      message:
        "Waiting for approval before generating the vendor catalog review",
      data: JSON.stringify({ requiresApproval: true }),
      createdAt: hoursAgo(1),
    },
  ])
  .run();

db.insert(schema.workflowCheckpoints)
  .values([
    {
      runId: vendorWorkflow!.id,
      stepId: vendorStep1!.id,
      checkpointKey: "navigation.completed",
      data: JSON.stringify({ href: "/vendor/catalog" }),
      createdAt: hoursAgo(1),
    },
  ])
  .run();

const assistantSessions = db
  .insert(schema.assistantSessions)
  .values([
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      role: "customer",
      mode: "text",
      title: "Quarterly reorder review",
      status: "active",
      sourcePage: "/dashboard",
      linkedWorkflowRunId: null,
      linkedDocumentId: null,
      lastError: null,
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(6),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      role: "customer",
      mode: "voice",
      title: "Morning finance briefing",
      status: "completed",
      sourcePage: "/invoices",
      linkedWorkflowRunId: pendingApprovalWorkflow!.id,
      linkedDocumentId: seededDocuments[0]!.id,
      lastError: null,
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(4),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      role: "customer",
      mode: "video",
      title: "Invoice aging dashboard review",
      status: "active",
      sourcePage: "/insights",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[0]!.id,
      lastError: null,
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(3),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      role: "customer",
      mode: "agentic",
      title: "Unpaid invoice follow-up",
      status: "active",
      sourcePage: "/workflows",
      linkedWorkflowRunId: pendingApprovalWorkflow!.id,
      linkedDocumentId: null,
      lastError: null,
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: adminUser.id,
      role: "admin",
      mode: "agentic",
      title: "Ops monthly review",
      status: "completed",
      sourcePage: "/admin/dashboard",
      linkedWorkflowRunId: seededWorkflow!.id,
      linkedDocumentId: seededDocuments[0]!.id,
      lastError: null,
      createdAt: hoursAgo(26),
      updatedAt: hoursAgo(24),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: adminUser.id,
      role: "admin",
      mode: "text",
      title: "Admin risk summary",
      status: "active",
      sourcePage: "/admin/sessions",
      linkedWorkflowRunId: null,
      linkedDocumentId: null,
      lastError: null,
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: northStarAccount.id,
      userId: northStarUser.id,
      role: "vendor",
      mode: "text",
      title: "Vendor payables review",
      status: "active",
      sourcePage: "/vendor/invoices",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[2]!.id,
      lastError: null,
      createdAt: hoursAgo(11),
      updatedAt: hoursAgo(5),
    },
    {
      customerId: bluePeakAccount.id,
      userId: bluePeakUser.id,
      role: "vendor",
      mode: "voice",
      title: "Morning supplier shipment brief",
      status: "completed",
      sourcePage: "/vendor/purchase-orders",
      linkedWorkflowRunId: null,
      linkedDocumentId: null,
      lastError: null,
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(6),
    },
    {
      customerId: redRiverAccount.id,
      userId: redRiverUser.id,
      role: "vendor",
      mode: "agentic",
      title: "Catalog constraint follow-up",
      status: "active",
      sourcePage: "/vendor/catalog",
      linkedWorkflowRunId: vendorWorkflow!.id,
      linkedDocumentId: null,
      lastError: null,
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: insertedCustomers[6]!.id,
      userId: greatLakesUser.id,
      role: "customer",
      mode: "text",
      title: "Window order status check",
      status: "active",
      sourcePage: "/dashboard",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[4]!.id,
      lastError: null,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(3),
    },
    {
      customerId: insertedCustomers[8]!.id,
      userId: cascadeUser.id,
      role: "customer",
      mode: "text",
      title: "First order tracking",
      status: "active",
      sourcePage: "/dashboard",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[5]!.id,
      lastError: null,
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(2),
    },
    {
      customerId: insertedCustomers[9]!.id,
      userId: loneStarUser.id,
      role: "customer",
      mode: "voice",
      title: "Pricing agreement discussion",
      status: "active",
      sourcePage: "/invoices",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[6]!.id,
      lastError: null,
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: summitAccount.id,
      userId: summitUser.id,
      role: "vendor",
      mode: "text",
      title: "Seal batch scheduling",
      status: "active",
      sourcePage: "/vendor/purchase-orders",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[8]!.id,
      lastError: null,
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(4),
    },
    {
      customerId: prairieAccount.id,
      userId: prairieUser.id,
      role: "vendor",
      mode: "agentic",
      title: "Trim kit constraint review",
      status: "active",
      sourcePage: "/vendor/catalog",
      linkedWorkflowRunId: null,
      linkedDocumentId: seededDocuments[9]!.id,
      lastError: null,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(2),
    },
  ])
  .returning()
  .all();

const assistantSessionByTitle = new Map(
  assistantSessions.map((session) => [session.title, session]),
);

db.insert(schema.assistantEntries)
  .values([
    {
      sessionId: assistantSessionByTitle.get("Quarterly reorder review")!.id,
      role: "system",
      entryType: "event",
      content: "Text session ready.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(12),
    },
    {
      sessionId: assistantSessionByTitle.get("Quarterly reorder review")!.id,
      role: "user",
      entryType: "message",
      content:
        "Recommend reorder quantities for the products that are trending up this quarter.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(12),
    },
    {
      sessionId: assistantSessionByTitle.get("Quarterly reorder review")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "Awning Window 36x24, Woven Pile Strip, and Retractable Screen Kit are all below comfortable buffer levels. I recommend replenishing those first and drafting a reorder brief for review.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(11),
    },
    {
      sessionId: assistantSessionByTitle.get("Morning finance briefing")!.id,
      role: "system",
      entryType: "event",
      content:
        "Voice session ready. Start listening or type a fallback transcript.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(10),
    },
    {
      sessionId: assistantSessionByTitle.get("Morning finance briefing")!.id,
      role: "user",
      entryType: "transcript",
      content:
        "Give me a 30 second summary of overdue invoices and tell me if I should create a follow-up workflow.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(10),
    },
    {
      sessionId: assistantSessionByTitle.get("Morning finance briefing")!.id,
      role: "assistant",
      entryType: "speech",
      content:
        "You currently have two overdue invoices totaling 12,400 dollars. I recommend creating a follow-up workflow to review them and prepare a finance summary.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(9),
    },
    {
      sessionId: assistantSessionByTitle.get("Invoice aging dashboard review")!
        .id,
      role: "user",
      entryType: "visual",
      content:
        "Invoice aging dashboard\nOpen receivables are concentrated in two overdue balances with one large shipment still in transit.",
      metadata: JSON.stringify({
        seeded: true,
        fileName: "invoice-aging-april.png",
        fileType: "image/png",
      }),
      createdAt: hoursAgo(9),
    },
    {
      sessionId: assistantSessionByTitle.get("Invoice aging dashboard review")!
        .id,
      role: "assistant",
      entryType: "summary",
      content:
        "Visual review captured for finance context. Two overdue balances should be turned into an unpaid invoice review before the next collections call.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(8),
    },
    {
      sessionId: assistantSessionByTitle.get("Unpaid invoice follow-up")!.id,
      role: "system",
      entryType: "plan",
      content: "Created workflow plan: Check unpaid invoices",
      metadata: JSON.stringify({
        seeded: true,
        workflowRunId: pendingApprovalWorkflow!.id,
        status: pendingApprovalWorkflow!.status,
      }),
      createdAt: hoursAgo(8),
    },
    {
      sessionId: assistantSessionByTitle.get("Unpaid invoice follow-up")!.id,
      role: "assistant",
      entryType: "event",
      content:
        "The invoices workspace has already been opened. Approval is still required before generating the unpaid invoice review.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(2),
    },
    {
      sessionId: assistantSessionByTitle.get("Ops monthly review")!.id,
      role: "system",
      entryType: "plan",
      content: "Created workflow plan: Check monthly reports and summarize.",
      metadata: JSON.stringify({
        seeded: true,
        workflowRunId: seededWorkflow!.id,
        status: seededWorkflow!.status,
      }),
      createdAt: daysAgo(1),
    },
    {
      sessionId: assistantSessionByTitle.get("Ops monthly review")!.id,
      role: "assistant",
      entryType: "artifact",
      content: "Generated document: Monthly Summary",
      metadata: JSON.stringify({
        seeded: true,
        documentId: seededDocuments[0]!.id,
      }),
      createdAt: daysAgo(1),
    },
    {
      sessionId: assistantSessionByTitle.get("Admin risk summary")!.id,
      role: "user",
      entryType: "message",
      content: "Summarize risky sessions and tell me what needs follow-up.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(5),
    },
    {
      sessionId: assistantSessionByTitle.get("Admin risk summary")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "One customer workflow is paused on approval and one agentic user session is still active. Review the pending invoice workflow first, then confirm whether to contact the account owner.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(4),
    },
    {
      sessionId: assistantSessionByTitle.get("Vendor payables review")!.id,
      role: "user",
      entryType: "message",
      content:
        "Summarize the invoices that are still pending payment and tell me what needs escalation.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(11),
    },
    {
      sessionId: assistantSessionByTitle.get("Vendor payables review")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "Two vendor invoices still need attention. One is approved and awaiting payment, and one is disputed. I recommend resolving the disputed RedRiver invoice before the next payables batch.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(10),
    },
    {
      sessionId: assistantSessionByTitle.get("Morning supplier shipment brief")!
        .id,
      role: "user",
      entryType: "transcript",
      content:
        "Brief me on purchase orders that are in production or in transit.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(9),
    },
    {
      sessionId: assistantSessionByTitle.get("Morning supplier shipment brief")!
        .id,
      role: "assistant",
      entryType: "speech",
      content:
        "There are two open purchase orders and one shipment in transit. BluePeak glass remains in production, and the RedRiver hardware shipment is due within two days.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(8),
    },
    {
      sessionId: assistantSessionByTitle.get("Catalog constraint follow-up")!
        .id,
      role: "system",
      entryType: "plan",
      content:
        "Created workflow plan: Review constrained catalog and summarize next actions",
      metadata: JSON.stringify({
        seeded: true,
        workflowRunId: vendorWorkflow!.id,
        status: vendorWorkflow!.status,
      }),
      createdAt: hoursAgo(7),
    },
    {
      sessionId: assistantSessionByTitle.get("Catalog constraint follow-up")!
        .id,
      role: "assistant",
      entryType: "event",
      content:
        "The vendor catalog has already been opened. Approval is still required before generating the vendor catalog review.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(1),
    },
    {
      sessionId: assistantSessionByTitle.get("Window order status check")!.id,
      role: "user",
      entryType: "message",
      content:
        "What is the status of our recent bay window and casement orders?",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(6),
    },
    {
      sessionId: assistantSessionByTitle.get("Window order status check")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "You have three active orders. ESP-2026-0019 shipped 8 days ago with bay windows and hinges. ESP-2026-0020 is confirmed and pending production for 15 picture window units.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(5),
    },
    {
      sessionId: assistantSessionByTitle.get("First order tracking")!.id,
      role: "user",
      entryType: "message",
      content: "Track my first order — when should I expect the patio doors?",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(5),
    },
    {
      sessionId: assistantSessionByTitle.get("First order tracking")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "Your delivered order ESP-2026-0023 arrived 36 days ago. Your current shipment ESP-2026-0024 with sliding windows is in transit and should arrive within the week.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(4),
    },
    {
      sessionId: assistantSessionByTitle.get("Pricing agreement discussion")!
        .id,
      role: "user",
      entryType: "transcript",
      content:
        "Walk me through the volume pricing tiers for hardware components.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(4),
    },
    {
      sessionId: assistantSessionByTitle.get("Pricing agreement discussion")!
        .id,
      role: "assistant",
      entryType: "speech",
      content:
        "Your current agreement gives 12 percent off hardware above 500 units per quarter. Based on your last two orders, you are on track to exceed that threshold this quarter.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(3),
    },
    {
      sessionId: assistantSessionByTitle.get("Seal batch scheduling")!.id,
      role: "user",
      entryType: "message",
      content:
        "When is the next EPDM bulb seal batch going out and what quantity?",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(8),
    },
    {
      sessionId: assistantSessionByTitle.get("Seal batch scheduling")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "PO-2026-2004 is confirmed for 200 EPDM bulb seal units and 300 fin seal units. The shipment is scheduled within 4 days. Invoice INV-V-2026-2004 is pending at 12,200 dollars.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(7),
    },
    {
      sessionId: assistantSessionByTitle.get("Trim kit constraint review")!.id,
      role: "system",
      entryType: "event",
      content: "Agentic session ready. Reviewing constrained trim catalog.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(6),
    },
    {
      sessionId: assistantSessionByTitle.get("Trim kit constraint review")!.id,
      role: "assistant",
      entryType: "message",
      content:
        "Interior trim kits are constrained with only 12 units available. The in-transit shipment VSHIP-PAT-2005 should relieve this within 24 hours. Retractable screen kits are at healthy stock levels.",
      metadata: JSON.stringify({ seeded: true }),
      createdAt: hoursAgo(5),
    },
  ])
  .run();

db.insert(schema.chatCaches)
  .values([
    {
      customerId: insertedCustomers[0]!.id,
      userId: acmeUser.id,
      sessionId: assistantSessionByTitle.get("Quarterly reorder review")!.id,
      role: "customer",
      sourceMode: "text",
      normalizedPrompt: "recommend reorder quantities",
      promptLabel: "Recommend reorder quantities",
      hitCount: 4,
      lastResponse:
        "Awning Window 36x24, Woven Pile Strip, and Retractable Screen Kit need replenishment first.",
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(2),
    },
    {
      customerId: insertedCustomers[0]!.id,
      userId: adminUser.id,
      sessionId: assistantSessionByTitle.get("Admin risk summary")!.id,
      role: "admin",
      sourceMode: "text",
      normalizedPrompt: "summarize risky sessions",
      promptLabel: "Summarize risky sessions",
      hitCount: 3,
      lastResponse:
        "One customer workflow is paused on approval and one agentic user session is still active.",
      createdAt: hoursAgo(5),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: northStarAccount.id,
      userId: northStarUser.id,
      sessionId: assistantSessionByTitle.get("Vendor payables review")!.id,
      role: "vendor",
      sourceMode: "text",
      normalizedPrompt: "summarize pending vendor invoices",
      promptLabel: "Summarize pending vendor invoices",
      hitCount: 2,
      lastResponse:
        "One invoice is approved and pending payment, and one disputed invoice needs escalation.",
      createdAt: hoursAgo(11),
      updatedAt: hoursAgo(3),
    },
    {
      customerId: redRiverAccount.id,
      userId: redRiverUser.id,
      sessionId: assistantSessionByTitle.get("Catalog constraint follow-up")!
        .id,
      role: "vendor",
      sourceMode: "agentic",
      normalizedPrompt: "review constrained catalog",
      promptLabel: "Review constrained catalog",
      hitCount: 3,
      lastResponse:
        "The vendor catalog review plan is waiting for approval before generation.",
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: insertedCustomers[6]!.id,
      userId: greatLakesUser.id,
      sessionId: assistantSessionByTitle.get("Window order status check")!.id,
      role: "customer",
      sourceMode: "text",
      normalizedPrompt: "bay window order status",
      promptLabel: "Bay window order status",
      hitCount: 2,
      lastResponse:
        "ESP-2026-0019 shipped with bay windows and hinges. ESP-2026-0020 confirmed for picture windows.",
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(3),
    },
    {
      customerId: insertedCustomers[9]!.id,
      userId: loneStarUser.id,
      sessionId: assistantSessionByTitle.get("Pricing agreement discussion")!
        .id,
      role: "customer",
      sourceMode: "voice",
      normalizedPrompt: "volume pricing tiers hardware",
      promptLabel: "Volume pricing tiers for hardware",
      hitCount: 1,
      lastResponse:
        "Current agreement gives 12% off hardware above 500 units per quarter.",
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(1),
    },
    {
      customerId: summitAccount.id,
      userId: summitUser.id,
      sessionId: assistantSessionByTitle.get("Seal batch scheduling")!.id,
      role: "vendor",
      sourceMode: "text",
      normalizedPrompt: "epdm bulb seal batch schedule",
      promptLabel: "EPDM bulb seal batch schedule",
      hitCount: 2,
      lastResponse:
        "PO-2026-2004 confirmed for 200 EPDM + 300 fin seal units. Shipping in 4 days.",
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(4),
    },
  ])
  .run();

console.log(
  `Seeded ${orderSeed.length} orders, ${invoiceCount} invoices (${overdueInvoices.length} overdue), ${shipmentCount} shipments, ${ediCount} EDI transactions, ${insertedSessions.length} auth sessions, ${assistantSessions.length} assistant sessions, ${insertedSessions.length + 1} audit logs, ${seededDocuments.length} documents, 3 workflow runs`,
);

// Print credentials table
console.log(
  "\n╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗",
);
console.log(
  "║                                    LOGIN CREDENTIALS                                            ║",
);
console.log(
  "╠═════════════════════════════════════════════════╦═══════════╦══════════╦════════════════════════╣",
);
console.log(
  "║ Email                                           ║ Password  ║ Role     ║ Company                ║",
);
console.log(
  "╠═════════════════════════════════════════════════╬═══════════╬══════════╬════════════════════════╣",
);
for (const user of insertedUsers) {
  const customer = insertedCustomers.find((c) => c.id === user.customerId);
  const companyName = (customer?.companyName ?? "").slice(0, 22);
  const email = user.email.padEnd(47);
  const role = user.role.padEnd(8);
  const company = companyName.padEnd(22);
  console.log(`║ ${email} ║ demo1234  ║ ${role} ║ ${company} ║`);
}
console.log(
  "╚═════════════════════════════════════════════════╩═══════════╩══════════╩════════════════════════╝",
);

sqlite.close();
console.log("\nSeed complete.");
