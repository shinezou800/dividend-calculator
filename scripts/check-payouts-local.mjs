import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const container = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_supabase-dividend-check';
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const payouts = migration('0002_payouts.sql').trim().replace(/^begin;/i, '').replace(/commit;$/i, '');
const sql = `
begin;
alter table public.holdings rename to holdings_payout_backup;
alter table public.app_admin rename to app_admin_payout_backup;
alter function public.is_admin() rename to is_admin_payout_backup;
${migration('0001_init.sql')}
${payouts}
do $$ begin
  assert (select count(*) from public.holdings where jsonb_array_length(payouts) > 0) = 4;
  assert (select round(shares * (payouts->0->>'dps')::numeric, 2) from public.holdings where code='600690') = 2675.00;
  begin
    update public.holdings set payouts='{}'::jsonb where code='600690';
    raise exception 'Non-array payouts were accepted';
  exception when check_violation then null;
  end;
end $$;
update public.holdings set payouts='[{"month":12,"dps":2,"note":"自定义"}]'::jsonb where code='600690';
${payouts}
do $$ begin
  assert (select payouts->0->>'note' from public.holdings where code='600690') = '自定义';
  raise notice 'PASS migrations 0001 + 0002: four seeds, Haier 2675.00, JSON-array constraint, idempotent nonempty configuration preserved';
end $$;
insert into public.app_admin (user_id) select user_id from public.app_admin_payout_backup limit 1;
select set_config('request.jwt.claim.sub', (select user_id::text from public.app_admin), true) is not null as local_admin_claim;
set local role anon;
do $$ begin
  assert (select count(*) from public.holdings where jsonb_typeof(payouts)='array') = 4;
  begin
    update public.holdings set payouts='[]'::jsonb where code='601318';
    raise exception 'Anonymous update was accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS anon: reads payouts on 4 rows; UPDATE payouts rejected';
end $$;
reset role;
set local role authenticated;
do $$ begin
  assert public.is_admin();
  update public.holdings set payouts='[{"month":1,"dps":0.5}]'::jsonb where code='601318';
  assert (select payouts from public.holdings where code='601318') = '[{"month":1,"dps":0.5}]'::jsonb;
  raise notice 'PASS admin: is_admin=true; UPDATE payouts succeeds and reselect matches';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true) = '' as clear_admin_claim;
set local role authenticated;
do $$ declare changed integer; begin
  assert not public.is_admin();
  update public.holdings set payouts='[]'::jsonb where code='601318';
  get diagnostics changed = row_count;
  assert changed = 0;
  raise notice 'PASS non-admin: UPDATE payouts affects 0 rows';
end $$;
reset role;
rollback;
`;
const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log('Local Supabase migration/RLS check passed; transaction rolled back, existing local data unchanged.');
