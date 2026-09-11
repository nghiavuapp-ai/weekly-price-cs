begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table private.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;
grant select, insert, delete on private.admin_users to service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.admin_users
        where user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

create or replace function private.reject_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
        using errcode = '55000';
end;
$$;

revoke all on function private.reject_append_only_change() from public, anon, authenticated;
grant execute on function private.reject_append_only_change() to service_role;

create table public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null check (btrim(name) <> ''),
    category text not null check (btrim(category) <> ''),
    capacity text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index products_name_ci_key on public.products (lower(name));

create table public.retailers (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (code = upper(code) and btrim(code) <> ''),
    name text not null unique check (btrim(name) <> ''),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.product_links (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete restrict,
    retailer_id uuid not null references public.retailers(id) on delete restrict,
    url text not null check (url ~ '^https?://'),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (product_id, retailer_id, url),
    unique (id, product_id, retailer_id)
);

create unique index product_links_one_active_pair_key
    on public.product_links (product_id, retailer_id)
    where active;

create table public.price_overrides (
    id uuid primary key default gen_random_uuid(),
    product_link_id uuid not null unique references public.product_links(id) on delete restrict,
    override_price bigint not null check (override_price > 0),
    note text not null check (btrim(note) <> ''),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.crawl_runs (
    id uuid primary key default gen_random_uuid(),
    run_key text not null unique check (btrim(run_key) <> ''),
    parent_run_id uuid references public.crawl_runs(id) on delete restrict,
    run_type text not null check (
        run_type in ('primary', 'retry', 'weekly', 'manual', 'shadow', 'historical_weekly', 'historical_daily')
    ),
    period_type text not null check (period_type in ('daily', 'weekly')),
    period_key text not null check (btrim(period_key) <> ''),
    period_start date not null,
    scheduled_for timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    status text not null check (status in ('queued', 'running', 'success', 'partial', 'failed', 'no_retry', 'cancelled')),
    total_targets integer not null default 0 check (total_targets >= 0),
    ok_count integer not null default 0 check (ok_count >= 0),
    oos_count integer not null default 0 check (oos_count >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    change_count integer not null default 0 check (change_count >= 0),
    review_count integer not null default 0 check (review_count >= 0),
    source text not null check (btrim(source) <> ''),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (completed_at is null or started_at is null or completed_at >= started_at),
    unique (period_type, period_key, run_key)
);

create index crawl_runs_period_idx
    on public.crawl_runs (period_type, period_start desc, completed_at desc);
create index crawl_runs_parent_idx on public.crawl_runs (parent_run_id) where parent_run_id is not null;

create table public.price_observations (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.crawl_runs(id) on delete restrict,
    product_id uuid not null references public.products(id) on delete restrict,
    retailer_id uuid not null references public.retailers(id) on delete restrict,
    product_link_id uuid,
    period_type text not null check (period_type in ('daily', 'weekly')),
    period_key text not null check (btrim(period_key) <> ''),
    period_start date not null,
    observed_at timestamptz not null,
    price_vnd bigint check (price_vnd is null or price_vnd > 0),
    in_stock boolean,
    fetch_ok boolean not null,
    review_status text not null default 'pending'
        check (review_status in ('pending', 'confirmed', 'rejected')),
    confidence text,
    risk_flags text[] not null default '{}',
    evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
    source_method text,
    error_message text,
    created_at timestamptz not null default now(),
    unique (run_id, product_id, retailer_id),
    foreign key (product_link_id, product_id, retailer_id)
        references public.product_links (id, product_id, retailer_id) on delete restrict,
    check (in_stock is distinct from true or price_vnd is not null),
    check (fetch_ok or in_stock is null)
);

create index price_observations_daily_current_idx
    on public.price_observations (product_id, retailer_id, observed_at desc, id desc)
    where period_type = 'daily' and fetch_ok;
create index price_observations_weekly_history_idx
    on public.price_observations (period_start desc, product_id, retailer_id)
    where period_type = 'weekly';
create index price_observations_pending_idx
    on public.price_observations (observed_at desc)
    where review_status = 'pending';

create table public.price_corrections (
    id uuid primary key default gen_random_uuid(),
    observation_id uuid not null references public.price_observations(id) on delete restrict,
    corrected_price bigint check (corrected_price is null or corrected_price > 0),
    corrected_in_stock boolean,
    note text not null check (btrim(note) <> ''),
    review_decision text not null check (review_decision in ('pending', 'confirmed', 'rejected')),
    author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    check (
        corrected_price is not null
        or corrected_in_stock is not null
        or review_decision <> 'pending'
    )
);

create index price_corrections_latest_idx
    on public.price_corrections (observation_id, created_at desc, id desc);

create trigger price_observations_append_only
before update or delete on public.price_observations
for each row execute function private.reject_append_only_change();

create trigger price_corrections_append_only
before update or delete on public.price_corrections
for each row execute function private.reject_append_only_change();

alter table public.products enable row level security;
alter table public.retailers enable row level security;
alter table public.product_links enable row level security;
alter table public.price_overrides enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_corrections enable row level security;

revoke all on public.products from public, anon, authenticated;
revoke all on public.retailers from public, anon, authenticated;
revoke all on public.product_links from public, anon, authenticated;
revoke all on public.price_overrides from public, anon, authenticated;
revoke all on public.crawl_runs from public, anon, authenticated;
revoke all on public.price_observations from public, anon, authenticated;
revoke all on public.price_corrections from public, anon, authenticated;

grant select (id, name, category, capacity, active)
    on public.products to anon;
grant select (id, code, name, active)
    on public.retailers to anon;
grant select (
    id, run_key, parent_run_id, run_type, period_type, period_key, period_start,
    scheduled_for, started_at, completed_at, status, total_targets, ok_count,
    oos_count, error_count, change_count, review_count, source, created_at
) on public.crawl_runs to anon;
grant select (
    id, run_id, product_id, retailer_id, period_type, period_key, period_start,
    observed_at, price_vnd, in_stock, fetch_ok, review_status, confidence,
    risk_flags, source_method, created_at
) on public.price_observations to anon;
grant select (
    id, observation_id, corrected_price, corrected_in_stock,
    review_decision, created_at
) on public.price_corrections to anon;

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.retailers to authenticated;
grant select, insert, update, delete on public.product_links to authenticated;
grant select, insert, update, delete on public.price_overrides to authenticated;
grant select, insert, update on public.crawl_runs to authenticated;
grant select, insert on public.price_observations to authenticated;
grant select, insert on public.price_corrections to authenticated;

grant select, insert, update, delete on public.products to service_role;
grant select, insert, update, delete on public.retailers to service_role;
grant select, insert, update, delete on public.product_links to service_role;
grant select, insert, update, delete on public.price_overrides to service_role;
grant select, insert, update on public.crawl_runs to service_role;
grant select, insert on public.price_observations to service_role;
grant select, insert on public.price_corrections to service_role;

create policy products_public_read
on public.products for select to anon using (true);
create policy retailers_public_read
on public.retailers for select to anon using (true);
create policy crawl_runs_public_read
on public.crawl_runs for select to anon using (true);
create policy observations_public_read
on public.price_observations for select to anon using (true);
create policy corrections_public_read
on public.price_corrections for select to anon using (true);

create policy products_admin_read
on public.products for select to authenticated using ((select private.is_admin()));
create policy products_admin_insert
on public.products for insert to authenticated with check ((select private.is_admin()));
create policy products_admin_update
on public.products for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy products_admin_delete
on public.products for delete to authenticated using ((select private.is_admin()));

create policy retailers_admin_read
on public.retailers for select to authenticated using ((select private.is_admin()));
create policy retailers_admin_insert
on public.retailers for insert to authenticated with check ((select private.is_admin()));
create policy retailers_admin_update
on public.retailers for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy retailers_admin_delete
on public.retailers for delete to authenticated using ((select private.is_admin()));

create policy product_links_admin_read
on public.product_links for select to authenticated using ((select private.is_admin()));
create policy product_links_admin_insert
on public.product_links for insert to authenticated with check ((select private.is_admin()));
create policy product_links_admin_update
on public.product_links for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy product_links_admin_delete
on public.product_links for delete to authenticated using ((select private.is_admin()));

create policy price_overrides_admin_read
on public.price_overrides for select to authenticated using ((select private.is_admin()));
create policy price_overrides_admin_insert
on public.price_overrides for insert to authenticated with check ((select private.is_admin()));
create policy price_overrides_admin_update
on public.price_overrides for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy price_overrides_admin_delete
on public.price_overrides for delete to authenticated using ((select private.is_admin()));

create policy crawl_runs_admin_read
on public.crawl_runs for select to authenticated using ((select private.is_admin()));
create policy crawl_runs_admin_insert
on public.crawl_runs for insert to authenticated with check ((select private.is_admin()));
create policy crawl_runs_admin_update
on public.crawl_runs for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy observations_admin_read
on public.price_observations for select to authenticated using ((select private.is_admin()));
create policy observations_admin_insert
on public.price_observations for insert to authenticated with check ((select private.is_admin()));

create policy corrections_admin_read
on public.price_corrections for select to authenticated using ((select private.is_admin()));
create policy corrections_admin_insert
on public.price_corrections for insert to authenticated
with check (
    (select private.is_admin())
    and author_id = (select auth.uid())
);

create view public.effective_price_observations
with (security_invoker = true, security_barrier = true)
as
select
    observation.id,
    observation.run_id,
    observation.product_id,
    product.name as product_name,
    product.category,
    product.capacity,
    observation.retailer_id,
    retailer.code as retailer_code,
    retailer.name as retailer_name,
    observation.period_type,
    observation.period_key,
    observation.period_start,
    observation.observed_at,
    coalesce(correction.corrected_price, observation.price_vnd) as effective_price_vnd,
    coalesce(correction.corrected_in_stock, observation.in_stock) as effective_in_stock,
    observation.fetch_ok,
    coalesce(correction.review_decision, observation.review_status) as effective_review_status,
    observation.confidence,
    observation.risk_flags,
    observation.source_method,
    correction.id as latest_correction_id,
    correction.created_at as corrected_at
from public.price_observations as observation
join public.products as product on product.id = observation.product_id
join public.retailers as retailer on retailer.id = observation.retailer_id
left join lateral (
    select candidate.id, candidate.corrected_price, candidate.corrected_in_stock,
           candidate.review_decision, candidate.created_at
    from public.price_corrections as candidate
    where candidate.observation_id = observation.id
    order by candidate.created_at desc, candidate.id desc
    limit 1
) as correction on true;

create view public.current_daily_prices
with (security_invoker = true, security_barrier = true)
as
select distinct on (effective.product_id, effective.retailer_id)
    effective.*,
    ((effective.observed_at at time zone 'Asia/Ho_Chi_Minh')::date
        < (now() at time zone 'Asia/Ho_Chi_Minh')::date) as stale
from public.effective_price_observations as effective
where effective.period_type = 'daily'
  and effective.fetch_ok
order by effective.product_id, effective.retailer_id,
         effective.observed_at desc, effective.id desc;

create view public.weekly_price_history
with (security_invoker = true, security_barrier = true)
as
select effective.*
from public.effective_price_observations as effective
where effective.period_type = 'weekly';

create view public.pending_price_reviews
with (security_invoker = true, security_barrier = true)
as
select effective.*
from public.effective_price_observations as effective
where effective.effective_review_status = 'pending';

create view public.price_platform_health
with (security_invoker = true, security_barrier = true)
as
with latest as (
    select
        max(period_start) filter (where period_type = 'daily' and fetch_ok) as latest_daily,
        max(period_start) filter (where period_type = 'weekly' and fetch_ok) as latest_weekly
    from public.price_observations
), retry_state as (
    select count(*)::integer as unresolved
    from public.crawl_runs
    where run_type = 'retry'
      and period_start = (now() at time zone 'Asia/Ho_Chi_Minh')::date
      and (status in ('partial', 'failed') or error_count > 0)
), incomplete_state as (
    select count(*)::integer as incomplete
    from public.crawl_runs
    where status in ('queued', 'running')
      and coalesce(started_at, scheduled_for, created_at) < now() - interval '60 minutes'
)
select
    'daily_stale'::text as check_name,
    (latest.latest_daily is not null
        and latest.latest_daily >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1) as healthy,
    jsonb_build_object('latest_daily', latest.latest_daily) as detail,
    now() as checked_at
from latest
union all
select
    'retry_unresolved',
    retry_state.unresolved = 0,
    jsonb_build_object('unresolved_runs', retry_state.unresolved),
    now()
from retry_state
union all
select
    'weekly_missing',
    (latest.latest_weekly is not null
        and latest.latest_weekly >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 8),
    jsonb_build_object('latest_weekly', latest.latest_weekly),
    now()
from latest
union all
select
    'run_incomplete',
    incomplete_state.incomplete = 0,
    jsonb_build_object('incomplete_runs', incomplete_state.incomplete),
    now()
from incomplete_state;

revoke all on public.effective_price_observations from public, anon, authenticated;
revoke all on public.current_daily_prices from public, anon, authenticated;
revoke all on public.weekly_price_history from public, anon, authenticated;
revoke all on public.pending_price_reviews from public, anon, authenticated;
revoke all on public.price_platform_health from public, anon, authenticated;
grant select on public.effective_price_observations to anon, authenticated, service_role;
grant select on public.current_daily_prices to anon, authenticated, service_role;
grant select on public.weekly_price_history to anon, authenticated, service_role;
grant select on public.pending_price_reviews to anon, authenticated, service_role;
grant select on public.price_platform_health to anon, authenticated, service_role;

alter table public.products replica identity full;
alter table public.retailers replica identity full;
alter table public.product_links replica identity full;
alter table public.price_overrides replica identity full;
alter table public.crawl_runs replica identity full;
alter table public.price_observations replica identity full;
alter table public.price_corrections replica identity full;

do $$
declare
    relation_name text;
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        foreach relation_name in array array[
            'products', 'retailers', 'product_links', 'price_overrides',
            'crawl_runs', 'price_observations', 'price_corrections'
        ] loop
            if not exists (
                select 1
                from pg_publication_tables
                where pubname = 'supabase_realtime'
                  and schemaname = 'public'
                  and tablename = relation_name
            ) then
                execute format(
                    'alter publication supabase_realtime add table public.%I',
                    relation_name
                );
            end if;
        end loop;
    end if;
end;
$$;

commit;
