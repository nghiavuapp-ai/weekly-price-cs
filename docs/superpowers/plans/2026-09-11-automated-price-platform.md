# Automated Price Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a free-tier, self-operating Daily/Weekly Price Check website with Supabase persistence, realtime manual corrections, cloud crawling, and compatible Excel exports.

**Architecture:** A React/Vite frontend on Vercel reads secure Supabase views. Existing Python crawler rules are wrapped with a database repository and run by public GitHub Actions on Playwright Chromium, triggered by Supabase Cron through a GitHub App dispatcher.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Postgres/Auth/Realtime/Edge Functions/Cron, Python 3.13, Playwright, GitHub Actions, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-11-automated-price-platform-design.md`

## Global Constraints

- Supabase is the source of truth; raw observations and corrections are append-only.
- Preserve validated FPT, MW, CPS, Shopdunk, and Viettel parser/risk/CTA rules.
- Public read; one fixed admin identity for writes; no secrets in the repository.
- Daily 11:00, retry 11:30, Weekly Friday 12:00 in Asia/Ho_Chi_Minh.
- Historical corrections apply only to the selected observation and are never overwritten by future crawls.
- All components must fit free-tier limits and support idempotent retry.

---

### Task 1: Database contract and historical import

**Files:** Create `supabase/migrations/202609110001_price_platform.sql`, `tools/import_supabase_data.py`, `tests/test_supabase_import.py`.

- [ ] Write failing tests for deterministic product/link records, historical Weekly rows, Daily snapshot rows, and idempotent payload generation.
- [ ] Implement pure import-payload builders and run the tests.
- [ ] Define tables, constraints, RLS policies, effective-data views, admin checks, Realtime publication, and health query.
- [ ] Add dry-run JSON output and authenticated batch upsert mode; verify two dry runs are byte-identical except explicit generation timestamps.

### Task 2: Database-backed crawler and Linux browser support

**Files:** Modify `tools/price_check_tool.py`, `tools/render_price_check.cjs`; create `tools/cloud_price_check.py`, `tests/test_cloud_price_check.py`, `requirements.txt`, `package.json`.

- [ ] Write failing tests for stable run IDs, retry target selection, Weekly period selection, observation serialization, and duplicate-safe writes.
- [ ] Make Node, module, and Chromium paths environment-driven with local defaults.
- [ ] Add Supabase repository reads/writes without changing parser decisions.
- [ ] Implement Daily, retry, Weekly, and shadow modes; preserve previous successful state on fetch failure.
- [ ] Run all Python and JavaScript tests plus a small dry-run crawl.

### Task 3: Realtime dashboard and admin editing

**Files:** Create the Vite app under `web/` with feature modules for dashboard, admin, Supabase data access, and Excel export.

- [ ] Write failing unit tests for effective-row selection, filters, stale state, correction validation, and workbook shaping.
- [ ] Recreate the accepted Weekly/Daily dashboard using live Supabase queries and realtime subscriptions.
- [ ] Add the quiet edit control, password-only fixed-admin sign-in, correction/review form, configuration manager, audit history, and sign-out.
- [ ] Add lazy-loaded ExcelJS exports matching Weekly sheets and Daily `Latest`/`Changes`/`Run Log` contracts.
- [ ] Verify build, desktop/mobile layouts, filters, drill-down, edit flow against a local Supabase-shaped fixture, and accessibility basics.

### Task 4: Scheduling, CI, deployment, and operations

**Files:** Create `.github/workflows/price-check.yml`, `supabase/functions/dispatch-price-check/index.ts`, `supabase/seed.sql`, `vercel.json`, `.env.example`; update shared project context and README.

- [ ] Add workflow validation tests for all three run types, pinned actions, least-privilege permissions, concurrency, timeout, artifacts, and secrets.
- [ ] Implement the dispatcher with signed GitHub App installation tokens and schedule payload validation.
- [ ] Configure three Supabase Cron jobs and manual workflow dispatch; make every trigger idempotent.
- [ ] Create the public GitHub repository, provision Supabase/Vercel when authenticated, set secrets without printing values, deploy, and run smoke tests.
- [ ] Execute a seven-day shadow checklist; keep production scheduling disabled until the user accepts the comparison.

### Task 5: Final verification

- [ ] Run the complete Python, frontend, build, SQL/static-security, and workflow validation suites.
- [ ] Test historical import idempotency, duplicate trigger handling, failed-fetch carry-forward, correction audit, realtime refresh, and both Excel downloads.
- [ ] Inspect the deployed site on desktop and mobile and confirm no browser errors or secret exposure.
- [ ] Update `PROJECT_CONTEXT.md`, `DECISIONS.md`, `TODO.md`, `SOURCES.md`, and `HANDOFF.md` with verified deployment state and recovery steps.

