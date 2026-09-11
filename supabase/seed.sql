-- Store these values with Supabase Vault before applying this file:
-- dispatcher_url, dispatcher_secret.
-- GitHub App values belong in Edge Function secrets, never in this SQL file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.request_price_check_dispatch(requested_run_type text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  dispatcher_url text;
  dispatcher_secret text;
  request_id bigint;
begin
  if requested_run_type not in ('primary', 'retry', 'weekly', 'shadow') then
    raise exception 'Unsupported run type';
  end if;
  select decrypted_secret into strict dispatcher_url
    from vault.decrypted_secrets where name = 'dispatcher_url';
  select decrypted_secret into strict dispatcher_secret
    from vault.decrypted_secrets where name = 'dispatcher_secret';
  select net.http_post(
    url := dispatcher_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', dispatcher_secret),
    body := jsonb_build_object('run_type', requested_run_type)
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.request_price_check_dispatch(text) from public, anon, authenticated;
grant execute on function public.request_price_check_dispatch(text) to service_role;

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'dispatcher_url')
     and exists (select 1 from vault.decrypted_secrets where name = 'dispatcher_secret') then
    perform cron.unschedule(jobid) from cron.job where jobname in (
      'price-check-primary-1100-vn', 'price-check-retry-1130-vn', 'price-check-weekly-friday-1200-vn'
    );
    perform cron.schedule('price-check-primary-1100-vn', '0 4 * * *',
      $job$select public.request_price_check_dispatch('primary');$job$);
    perform cron.schedule('price-check-retry-1130-vn', '30 4 * * *',
      $job$select public.request_price_check_dispatch('retry');$job$);
    perform cron.schedule('price-check-weekly-friday-1200-vn', '0 5 * * 5',
      $job$select public.request_price_check_dispatch('weekly');$job$);
  else
    raise notice 'Price Check schedules not installed: add dispatcher_url and dispatcher_secret to Vault first.';
  end if;
end;
$$;
