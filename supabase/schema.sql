-- Yong Cik Nor Tau Foo AU3 Keramat — order system schema
-- Target: Postgres (designed for Supabase, but plain Postgres works too)

create extension if not exists "uuid-ossp";

-- ---------- Enums ----------

create type item_status as enum ('queued', 'cooking', 'ready', 'picked_up');
create type stock_response as enum ('available', 'unavailable');
create type board_status as enum ('preparing', 'ready', 'done');

-- ---------- Stations (kitchens) ----------
-- e.g. 'Yong Tau Foo', 'Beverage', 'Hot Food'

create table stations (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique
);

-- ---------- Menu items ----------
-- `available` is the flag the counter tablet checks before letting
-- staff add the item to a new order. Flipped either by a proactive
-- update from the kitchen, or by resolving a stock_check_request.

create table menu_items (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  price      numeric(10,2) not null,
  station_id uuid not null references stations(id),
  available  boolean not null default true
);

-- ---------- Orders ----------
-- board_status is NOT set directly by the app — it's maintained by
-- the trigger below, derived from the statuses of this order's items.
-- recalled_at is set by the pickup tablet when staff manually flag an
-- order that's been sitting in "ready" too long.

create table orders (
  id            uuid primary key default uuid_generate_v4(),
  order_number  int not null,
  created_at    timestamptz not null default now(),
  payment_status text not null default 'unpaid', -- 'unpaid' | 'paid'
  total_amount  numeric(10,2) not null default 0,
  board_status  board_status not null default 'preparing',
  recalled_at   timestamptz
);

create index on orders (order_number);

-- ---------- Order items ----------
-- One row per food/drink line within an order. station_id is
-- denormalized from menu_items so each kitchen tablet can filter
-- with a single indexed column instead of a join.

create table order_items (
  id                uuid primary key default uuid_generate_v4(),
  order_id          uuid not null references orders(id) on delete cascade,
  menu_item_id      uuid not null references menu_items(id),
  station_id        uuid not null references stations(id),
  quantity          int not null default 1,
  unit_price        numeric(10,2) not null,
  status            item_status not null default 'queued',
  status_updated_at timestamptz not null default now()
);

create index on order_items (order_id);
create index on order_items (station_id, status);

-- ---------- Stock check requests ----------
-- Created when a counter worker taps "ask kitchen" next to an item.
-- Shows as a pending banner on that station's tablet until resolved.

create table stock_check_requests (
  id            uuid primary key default uuid_generate_v4(),
  menu_item_id  uuid not null references menu_items(id),
  station_id    uuid not null references stations(id),
  order_id      uuid references orders(id), -- the order that triggered the ask, if any
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  response      stock_response
);

create index on stock_check_requests (station_id, resolved_at);

-- ---------- Board status trigger ----------
-- Recomputes an order's board_status every time one of its items
-- changes status. This is what makes the board move an order between
-- "Ready" and "Preparing" automatically as items are picked up:
--   - any item still ready & uncollected -> 'ready'
--   - else any item still queued/cooking -> 'preparing'
--   - else (everything picked up)        -> 'done' (dropped from the board)
-- Also clears a manual recall flag once the order leaves 'ready',
-- since a recall only makes sense while something is waiting for pickup.

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
$$ language plpgsql;

create trigger trg_order_items_status_change
after insert or update of status or delete on order_items
for each row execute function recompute_order_board_status();

-- ---------- Live board view ----------
-- What the status-board screen queries. Orders drop out automatically
-- once board_status becomes 'done'. Recalled orders and ready orders
-- surface first; within those groups, oldest first.

create view live_board as
select id, order_number, board_status, recalled_at, created_at
from orders
where board_status <> 'done'
order by
  case board_status when 'ready' then 0 else 1 end,
  recalled_at nulls last,
  created_at;

-- ---------- Notes ----------
-- 1. Realtime: subscribe to changes on `order_items` for the kitchen
--    tablets (filter by station_id), and on `orders` for the status
--    board and pickup tablet (both react to board_status changes).
-- 2. order_number: this schema doesn't reset it daily. If you want
--    numbers like 1, 2, 3... resetting each morning rather than an
--    ever-growing count, generate it in the app from the day's max
--    existing order_number instead of a global sequence.
-- 3. Pickup confirmation: the pickup tablet updates order_items.status
--    to 'picked_up' for the collected items — that single update is
--    what the trigger uses to shift the order between board states.
