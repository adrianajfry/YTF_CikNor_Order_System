-- Example menu for Yong Cik Nor Tau Foo AU3 Keramat.
-- Run this AFTER schema.sql and auth_and_rls.sql.
-- Edit names/prices to match the real menu, or just use this as a
-- starting point and keep editing in the Supabase Table Editor.

insert into stations (name, slug) values
  ('Yong Tau Foo', 'ytf'),
  ('Beverage', 'beverage'),
  ('Hot Food', 'hotfood');

-- Yong Tau Foo station — priced per piece, customer's bowl gets
-- weighed/counted at the counter like today.
insert into menu_items (name, price, station_id) values
  ('Beancurd (Tau Foo)',          1.00, (select id from stations where slug = 'ytf')),
  ('Fried Beancurd Skin (Tau Kee)', 1.20, (select id from stations where slug = 'ytf')),
  ('Brinjal (Eggplant)',          1.00, (select id from stations where slug = 'ytf')),
  ('Bitter Gourd',                1.20, (select id from stations where slug = 'ytf')),
  ('Lady''s Finger (Okra)',       1.00, (select id from stations where slug = 'ytf')),
  ('Fishball',                    0.80, (select id from stations where slug = 'ytf')),
  ('Meatball',                    0.80, (select id from stations where slug = 'ytf')),
  ('Stuffed Chilli',              1.20, (select id from stations where slug = 'ytf')),
  ('Fishcake',                    1.00, (select id from stations where slug = 'ytf')),
  ('Bee Hoon (Rice Vermicelli)',  2.00, (select id from stations where slug = 'ytf')),
  ('Yellow Mee',                  2.00, (select id from stations where slug = 'ytf')),
  ('Kuey Teow',                   2.00, (select id from stations where slug = 'ytf'));

-- Hot food station
insert into menu_items (name, price, station_id) values
  ('Nasi Goreng',            7.00, (select id from stations where slug = 'hotfood')),
  ('Mee Goreng',             7.00, (select id from stations where slug = 'hotfood')),
  ('Kuey Teow Goreng',       7.50, (select id from stations where slug = 'hotfood')),
  ('Nasi Goreng Telur',      7.50, (select id from stations where slug = 'hotfood'));

-- Beverage station
insert into menu_items (name, price, station_id) values
  ('Teh Ais',            2.50, (select id from stations where slug = 'beverage')),
  ('Kopi Ais',           2.50, (select id from stations where slug = 'beverage')),
  ('Barley Ais',         3.00, (select id from stations where slug = 'beverage')),
  ('Soya Bean',          2.50, (select id from stations where slug = 'beverage')),
  ('Chrysanthemum Tea',  2.50, (select id from stations where slug = 'beverage')),
  ('Iced Lemon Tea',     3.00, (select id from stations where slug = 'beverage')),
  ('Plain Water',        1.00, (select id from stations where slug = 'beverage'));
