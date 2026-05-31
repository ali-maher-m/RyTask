COMPOSE ?= docker compose
COMPOSE_DEV := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: help up dev down logs migrate seed build lint format typecheck test test-int checks backup

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Bring the whole stack online (built, migrated, seeded)
	$(COMPOSE) up -d --build

dev: ## Start the stack with hot reload
	$(COMPOSE_DEV) up

down: ## Stop the stack and remove containers
	$(COMPOSE) down

logs: ## Tail all service logs
	$(COMPOSE) logs -f

migrate: ## Run DB migrations + seed against the running stack
	$(COMPOSE) run --rm migrate

seed: ## Run the deterministic seed locally
	pnpm db:seed

build: ## Build all workspace packages/apps
	pnpm build

lint: ## Lint + format check (Biome)
	pnpm lint

format: ## Apply Biome formatting
	pnpm format

typecheck: ## Type-check all packages/apps
	pnpm typecheck

test: ## Run unit + contract tests
	pnpm test

test-int: ## Run integration tests (requires Docker)
	pnpm test:integration

checks: ## Run the closed-testing + architecture gates
	pnpm check:required-tests && pnpm check:mcp-parity && pnpm check:boundaries

backup: ## Dump the Postgres database to ./backup.sql
	$(COMPOSE) exec -T postgres pg_dump -U rytask rytask > backup.sql
