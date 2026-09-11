# Automated Price Platform Design

## Goal

Move Daily and Weekly Price Check to a zero-touch, free-tier web platform while preserving the validated crawler rules, full history, manual corrections, realtime updates, and the existing Excel deliverables.

## Architecture

- Vercel hosts a React/Vite single-page app. Public visitors read effective price data directly from Supabase; the deployed HTML no longer embeds the full dataset.
- Supabase Postgres is the operational source of truth. Raw crawler observations are append-only. Manual corrections are append-only overlays, so later crawls never rewrite historical corrections.
- Supabase Auth owns one fixed administrator identity. The UI preconfigures the email and asks only for the password. Public signup is disabled; RLS allows public reads and only the configured admin to mutate data.
- Supabase Cron invokes a GitHub App-backed dispatcher Edge Function at 11:00 and 11:30 daily and at 12:00 Friday in `Asia/Ho_Chi_Minh`. The dispatcher starts a public-repository GitHub Actions workflow. Run IDs and database constraints make duplicate invocations safe.
- GitHub Actions runs Python plus Playwright Chromium on Linux, reusing the existing retailer parsing, risk scoring, CTA/OOS, and browser verification rules. It writes run metadata and observations to Supabase with a server-only key.

## Data Model

- `products`, `retailers`, and `product_links` replace `Link Product.xlsx` as crawler input and are editable by the admin.
- `price_overrides` replaces `Price Overrides.csv`; an active URL override affects crawler results and is separate from a historical manual correction.
- `crawl_runs` records cadence, start/end, counts, status, and errors.
- `price_observations` stores one raw outcome for each product/retailer/run/period, including price, stock, confidence, risk flags, evidence, and source method.
- `price_corrections` stores append-only corrections for one observation: corrected price, stock, note, review decision, author, and timestamp.
- Security-invoker views expose effective observations (latest correction wins), current Daily state with stale carry-forward, Weekly history, pending reviews, and health status.

## Product Behaviour

- The current Weekly/Daily dashboard interaction, filters, 13-week trend, and Daily drill-down remain available.
- A deliberately quiet edit control opens the admin password prompt. An authenticated admin can confirm, correct, or leave a row pending; edit price, stock, and note; and manage models, partners, URLs, and crawler overrides.
- Supabase Realtime refreshes observations, corrections, runs, and configuration without a page reload.
- Excel export runs in the browser on demand. Weekly retains week-named sheets and partner columns; Daily retains `Latest`, `Changes`, and `Run Log` with the established headers.
- Health warnings appear when Daily is stale, retry has unresolved errors, Weekly is missing, or a run remains incomplete.

## Failure and Security Rules

- Failed fetches never replace the last successful Daily state. Risky results remain visible as Pending Review and keep all crawler evidence.
- Secrets are never committed. GitHub receives Supabase server credentials through Actions secrets; Supabase Vault stores GitHub App credentials; the browser receives only the Supabase URL, publishable key, and non-secret fixed admin email.
- Every exposed table has RLS. Public users receive read-only access. Admin writes are authorized by a private `admin_users` mapping keyed by `auth.uid()`; service writes use the server key only in GitHub Actions.
- The user-provided initial password is provisioned directly in Supabase Auth and is never written to repository files, Vercel variables, logs, or documentation.

## Rollout

- Import all historical Weekly data, existing Daily snapshots/run log, products, links, and overrides using idempotent migration scripts.
- Run the cloud pipeline in shadow mode for seven days and compare counts, price values, OOS states, risk flags, and workbook exports with the local workflow.
- Enable the cloud schedules only after the shadow acceptance checks pass; keep manual workflow dispatch available for recovery.

