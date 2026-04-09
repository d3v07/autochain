.PHONY: dev build test seed clean typecheck install setup

DB_PATH := $(CURDIR)/autochain.db

install:
	pnpm install

dev:
	DATABASE_URL=$(DB_PATH) pnpm turbo dev

build:
	pnpm turbo build

test:
	pnpm turbo test

typecheck:
	pnpm turbo typecheck

seed:
	DATABASE_URL=$(DB_PATH) pnpm --filter @autochain/db seed

clean:
	pnpm turbo clean
	rm -f $(DB_PATH)

setup: install seed
	@echo "Setup complete. Run 'make dev' to start."
