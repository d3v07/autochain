# AutoChain eSupplyPro Handoff

This repository contains a B2B supply operations platform prototype with three role surfaces:
- client
- vendor
- admin

## Core Apps
- `apps/web`: Next.js frontend
- `apps/api`: Fastify backend
- `packages/db`: Drizzle schema + seed
- `packages/shared`: shared contracts

## Local Run
```bash
pnpm install
pnpm --filter @autochain/db seed
pnpm --filter @autochain/api dev
pnpm --filter @autochain/web dev
```

## Demo Accounts
- Admin: `admin@autochain.io` / `demo1234`
- Client: `orders@acmewindows.com` / `demo1234`
- Vendor: `ops@northstarextrusions.com` / `demo1234`
