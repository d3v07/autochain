# AutoChain eSupplyPro

AutoChain eSupplyPro is a B2B supply operations platform prototype built as a monorepo.

## Workspace
- `apps/web`: Next.js frontend
- `apps/api`: Fastify API
- `packages/db`: Drizzle + SQLite schema, client, and seed
- `packages/shared`: shared Zod schemas and TypeScript contracts

## Local Development
```bash
pnpm install
pnpm --filter @autochain/db seed
pnpm --filter @autochain/api dev
pnpm --filter @autochain/web dev
```

## Default Local Ports
- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## Demo Accounts
- Admin: `admin@autochain.io` / `demo1234`
- Client: `orders@acmewindows.com` / `demo1234`
- Vendor: `ops@northstarextrusions.com` / `demo1234`
