-- Adds per-station login and restricts each role to its own data.
-- Run this AFTER schema.sql and BEFORE seed.sql.

-- A slug per station lets RLS policies compare a logged-in staff
-- member's role directly against the station they belong to.
alter table stations add column if not exists slug text unique;

-- One row per staff account, linked 1:1 to a Supabase Auth user.
-- Accounts themselves are created with the admin script
-- (scripts/create-staff-accounts.mjs), never through public sign-up.
create table staff (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('counter', 'ytf', 'beverage', 'hotfood', 'pickup')),
  display_name text
);

-- Looks up the calling user's own role. Used by every policy below.
-- Not security definer: it only ever reads the caller's own staff
-- row, which the policy on `staff` already allows them to read.
create or replace function current_staff_role()
returns text
language sql
stable
as $$
  select role from staff where id = auth.uid();
$$;

-- The trigger from schema.sql needs to update `orders` no matter
-- which role's action (counter, a kitchen, or pickup) triggered it.
-- security definer makes it run with the function owner's
-- privileges instead of the calling role's, so it isn't blocked by
-- the per-role policies on `orders` below.
create or replace function recompute_order_board_status()
returns trigger as $$
declare
  v_order_id  uuid := coalesce(new.order_id, old.order_id);
  v_has_ready boolean;
  v_has_pending boolean;
begin
  select
    exists (select 1 from order_items where order_id = v_order_id and status = 'ready'),
    exists (select 1 from order_items where order_id = v_order_id and status in ('queued', 'cooking'))
  into v_has_ready, v_has_pending;

  update orders
  set board_status = case
        when v_has_ready then 'ready'
        when v_has_pending then 'preparing'
        else 'done'
      end,
      recalled_at = case when v_has_ready then recalled_at else null end
  where id = v_order_id;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- Row Level Security ----------

alter table staff enable row level security;
create policy "staff can read own row" on staff
  for select using (auth.uid() = id);

alter table stations enable row level security;
create policy "logged-in staff can read stations" on stations
  for select using (auth.role() = 'authenticated');

alter table menu_items enable row level security;
create policy "logged-in staff can read menu" on menu_items
  for select using (auth.role() = 'authenticated');

alter table orders enable row level security;
-- Board is a public display — order number + status only, nothing
-- sensitive — so it's readable without logging in.
create policy "orders are publicly viewable" on orders
  for select using (true);
create policy "counter can create orders" on orders
  for insert with check (current_staff_role() = 'counter');
create policy "pickup can update orders" on orders
  for update using (current_staff_role() = 'pickup');

alter table order_items enable row level security;
create policy "counter can create order items" on order_items
  for insert with check (current_staff_role() = 'counter');
create policy "a station can see its own items" on order_items
  for select using (
    current_staff_role() = (select slug from stations where id = order_items.station_id)
  );
create policy "a station can update its own items" on order_items
  for update using (
    current_staff_role() = (select slug from stations where id = order_items.station_id)
  );
create policy "pickup can see all items" on order_items
  for select using (current_staff_role() = 'pickup');
create policy "pickup can update all items" on order_items
  for update using (current_staff_role() = 'pickup');

alter table stock_check_requests enable row level security;
create policy "counter can create stock checks" on stock_check_requests
  for insert with check (current_staff_role() = 'counter');
create policy "a station can see its own stock checks" on stock_check_requests
  for select using (
    current_staff_role() = (select slug from stations where id = stock_check_requests.station_id)
  );
create policy "a station can resolve its own stock checks" on stock_check_requests
  for update using (
    current_staff_role() = (select slug from stations where id = stock_check_requests.station_id)
  );

-- Also go to Authentication -> Providers -> Email in the Supabase
-- dashboard and turn OFF "Allow new users to sign up" — accounts
-- should only ever be created by the admin script below.
