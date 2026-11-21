create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  shares numeric not null default 0 check (shares >= 0),
  price numeric not null default 0 check (price >= 0),
  dps numeric not null default 0 check (dps >= 0),
  dps_note text,
  sort int not null default 0,
  updated_at timestamptz default now()
);
create table public.app_admin (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.app_admin enable row level security;
revoke all on public.app_admin from anon, authenticated;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.app_admin where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
alter table public.holdings enable row level security;
grant select on public.holdings to anon, authenticated;
revoke insert, update, delete on public.holdings from anon;
grant insert, update, delete on public.holdings to authenticated;
create policy holdings_read on public.holdings for select to anon, authenticated using (true);
create policy holdings_insert on public.holdings for insert to authenticated with check (public.is_admin());
create policy holdings_update on public.holdings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy holdings_delete on public.holdings for delete to authenticated using (public.is_admin());
insert into public.holdings (code, name, shares, price, dps, dps_note, sort) values
('601318', '平安', 5000, 55.46, 2.70, '2025年度 · 价格为2026-11-20收盘', 0),
('601166', '兴业', 3000, 20.30, 1.066, '2025年度', 1),
('600690', '海尔', 3000, 23.02, 1.16, '2025年度', 2),
('000538', '白药', 1000, 56.40, 2.602, 'TTM（滚动十二个月）', 3);
