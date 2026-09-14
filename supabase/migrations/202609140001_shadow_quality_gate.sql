begin;

create table public.shadow_quality_runs (
    period_key date primary key,
    checked_at timestamptz not null default now(),
    passed boolean not null,
    status text not null check (status in ('passed', 'failed', 'waiting_local')),
    failed_checks text[] not null default '{}',
    report jsonb not null check (jsonb_typeof(report) = 'object')
);

create table public.price_automation_state (
    id text primary key check (id = 'apple_price_check'),
    production_enabled boolean not null default false,
    consecutive_passes integer not null default 0 check (consecutive_passes >= 0),
    last_shadow_date date,
    promoted_at timestamptz,
    updated_at timestamptz not null default now()
);

insert into public.price_automation_state (id)
values ('apple_price_check')
on conflict (id) do nothing;

alter table public.shadow_quality_runs enable row level security;
alter table public.price_automation_state enable row level security;
revoke all on public.shadow_quality_runs from public, anon, authenticated;
revoke all on public.price_automation_state from public, anon, authenticated;
grant select, insert, update on public.shadow_quality_runs to service_role;
grant select, insert, update on public.price_automation_state to service_role;

commit;
