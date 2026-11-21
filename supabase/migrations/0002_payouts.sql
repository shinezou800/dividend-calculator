begin;

alter table public.holdings
  add column if not exists payouts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.holdings'::regclass
      and conname = 'holdings_payouts_array'
  ) then
    alter table public.holdings add constraint holdings_payouts_array
      check (jsonb_typeof(payouts) = 'array');
  end if;
end;
$$;

update public.holdings
set payouts = case code
  when '601318' then '[{"month":6,"dps":1.75,"note":"平安末期"},{"month":10,"dps":0.95,"note":"平安中期"}]'::jsonb
  when '601166' then '[{"month":2,"dps":0.565,"note":"兴业中期估"},{"month":6,"dps":0.501,"note":"兴业末期"}]'::jsonb
  when '600690' then '[{"month":8,"dps":0.891667,"note":"海尔末期"}]'::jsonb
  when '000538' then '[{"month":4,"dps":1.583,"note":"白药年度估"},{"month":9,"dps":1.038,"note":"白药特别分红，不确定","special":true}]'::jsonb
end
where payouts = '[]'::jsonb
  and code in ('601318', '601166', '600690', '000538');

commit;
