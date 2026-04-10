# AutoChain eSupplyPro

A full-stack B2B supply chain operations platform for window, door, and glass distributors. Three role-based portals (customer, vendor, admin) with an integrated AI assistant, real-time order tracking, invoice management, and workflow automation.

Built as a TypeScript monorepo with Next.js, Fastify, SQLite, and Drizzle ORM.

---

## Customer Portal

Customers manage orders, track deliveries, review invoices, and interact with an AI assistant that surfaces insights from their supply chain data.

### Dashboard
Overview of orders, outstanding balances, delivery tracking, and AI-generated insights with a visual analytics studio.

![Customer Dashboard](docs/screenshots/02-customer-dashboard.png)

### Delivery Tracker & Visual Insights
Real-time freight status with ETA tracking. The visual insights studio generates charts from natural language prompts — savings analysis, supplier mix, freight activity.

![Delivery & Insights](docs/screenshots/03-delivery-insights.png)

### Orders
Full order lifecycle from draft to delivery. AI summary highlights pending shipments and order totals at a glance.

![Orders](docs/screenshots/04-orders.png)

### Invoices
Invoice tracking with overdue alerts, payment status, and one-click payment actions.

![Invoices](docs/screenshots/05-invoices.png)

### Products
Product catalog with window, door, glass, hardware, and weatherstripping categories. Real-time inventory levels and pricing.

![Products](docs/screenshots/06-products.png)

### Documents
AI-generated reports, agreements, and briefs linked to assistant sessions. Version-controlled with markdown content.

![Documents](docs/screenshots/07-documents.png)

### Workflows
Multi-step workflow automation — invoice review, inventory reorder suggestions, agreement drafting. Approve, reject, or let the AI agent execute autonomously.

![Workflows](docs/screenshots/08-workflows.png)

### AI Insights
Actionable intelligence surfaced from order patterns, invoice aging, freight lanes, and inventory levels.

![AI Insights](docs/screenshots/09-insights.png)

### EDI Log
Electronic Data Interchange transaction log for purchase orders, invoices, and shipping notices.

![EDI Log](docs/screenshots/10-edi.png)

---

## Vendor Portal

Vendors manage inbound purchase orders, update catalog availability, track outbound shipments, and handle invoicing.

### Vendor Dashboard
Reliability score, active PO summary, recommended follow-up actions, and recent order activity.

![Vendor Dashboard](docs/screenshots/11-vendor-dashboard.png)

### Purchase Orders & Freight
PO detail with line items, freight creation, carrier tracking, and delivery status updates.

![Purchase Orders](docs/screenshots/12-vendor-purchase-orders.png)

### Vendor Catalog
Manage product availability, lead times, minimum order quantities, and stock constraints.

![Vendor Catalog](docs/screenshots/13-vendor-catalog.png)

### Vendor Invoices
Submit and track invoices against purchase orders. Status workflow: pending, approved, disputed, paid.

![Vendor Invoices](docs/screenshots/14-vendor-invoices.png)

---

## Admin Portal

Platform administrators manage all customers, users, sessions, and cross-account order visibility.

### Admin Dashboard
Aggregate metrics across all accounts — total revenue, order volume, active users, with a cross-customer order table.

![Admin Dashboard](docs/screenshots/15-admin-dashboard.png)

### User Management
Manage all platform users across customer and vendor accounts. Role assignment, status control, and feature flags.

![Admin Users](docs/screenshots/16-admin-users.png)

### Session Management
Active session monitoring with IP addresses, user agents, and revocation controls.

![Admin Sessions](docs/screenshots/17-admin-sessions.png)

---

## AI Assistant

Every portal includes a persistent AI assistant workspace with four interaction modes:

| Mode | Description |
|------|-------------|
| **Text** | Typed conversation with editable summaries |
| **Voice** | Live transcript with spoken replies (browser SpeechRecognition + speechSynthesis) |
| **Visual** | Screenshot and dashboard-guided review |
| **Agentic** | Plan, approve, and execute in-app workflows autonomously |

The assistant has memory, connector integrations (Gmail), document generation, and context-aware caching.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Fastify, TypeScript |
| Database | SQLite via Drizzle ORM |
| AI | Ollama (local LLM), workflow runtime |
| Validation | Zod (shared schemas) |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Vitest (39 tests across 9 files) |

## Architecture

```
autochain/
  apps/
    web/          Next.js frontend (App Router)
    api/          Fastify REST API
  packages/
    db/           Drizzle schema, SQLite client, seed data
    shared/       Zod schemas, TypeScript contracts
  data/           SQLite database (gitignored)
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Seed the database (16 users, 10 clients, 5 vendors, 28 orders, full supply chain data)
pnpm --filter @autochain/db seed

# Start the API (port 3001)
pnpm --filter @autochain/api dev

# Start the frontend (port 3000)
pnpm --filter @autochain/web dev
```

## Demo Accounts

All accounts use password `demo1234`.

### Customers (10)

| Email | Company |
|-------|---------|
| orders@acmewindows.com | Acme Windows & Doors |
| purchasing@pacificglaze.com | Pacific Coast Glazing |
| supply@heartlandfen.com | Heartland Fenestration |
| ops@neglass.com | Northeast Glass Partners |
| orders@sunbeltbp.com | SunBelt Building Products |
| buy@mtnviewcs.com | Mountain View Contractors |
| procurement@greatlakeswin.com | Great Lakes Window Co |
| sales@seaglass.com | Southeastern Architectural |
| orders@cascadefen.com | Cascade Fenestration Group |
| purchasing@lonestardoors.com | Lone Star Door Systems |

### Vendors (5)

| Email | Company |
|-------|---------|
| ops@northstarextrusions.com | NorthStar Extrusions Supply |
| ops@bluepeakglass.com | BluePeak Glass Manufacturing |
| ops@redriverhardware.com | RedRiver Hardware Components |
| ops@summitseal.com | Summit Seal & Gasket Co |
| ops@prairietrim.com | Prairie Accessories & Trim |

### Admin

| Email | Role |
|-------|------|
| admin@autochain.io | Platform administrator |

## Seed Data

The seed script is idempotent — it skips if users already exist to preserve sessions and documents. Use `--force` to wipe and re-seed:

```bash
# First run or incremental (safe)
pnpm --filter @autochain/db seed

# Full reset
pnpm --filter @autochain/db seed -- --force
```

Seeded data includes: 22 products, 28 orders, 19 invoices, 17 shipments, 5 purchase orders, 5 vendor profiles, 10 documents, 12 assistant sessions, and 3 automated workflow runs.

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @autochain/api test

# Typecheck all packages
pnpm typecheck
```

## License

MIT
