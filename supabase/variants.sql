-- Run in Supabase Dashboard → SQL Editor, after schema.sql and seed.sql.
-- Stores every child variant (size / color / gender combination).
-- RLS on, public read — same as products. No public writes.

create table if not exists product_variants (
  sku         text          primary key,
  parent_sku  text          not null references products(sku),
  size        text,
  color       text,
  gender      text,             -- 'M', 'W', or 'U'
  unit_price  numeric(10,2) not null check (unit_price >= 0),
  rental_rate numeric(10,2)     check (rental_rate >= 0)
);

alter table product_variants enable row level security;

create policy "Public can read variants"
  on product_variants for select using (true);

-- ── SEED ─────────────────────────────────────────────────────────
insert into product_variants (sku, parent_sku, size, color, gender, unit_price, rental_rate) values

-- SNK-001  Reef Explorer Snorkel Mask  (S/M/L × Clear/Black)
('SNK-001-S-CLR',   'SNK-001', 'S', 'Clear', 'U', 42.99, 5.36),
('SNK-001-M-CLR',   'SNK-001', 'M', 'Clear', 'U', 42.99, 4.96),
('SNK-001-L-CLR',   'SNK-001', 'L', 'Clear', 'U', 42.99, 4.73),
('SNK-001-S-BLK',   'SNK-001', 'S', 'Black', 'U', 42.99, 4.82),
('SNK-001-M-BLK',   'SNK-001', 'M', 'Black', 'U', 42.99, 4.91),
('SNK-001-L-BLK',   'SNK-001', 'L', 'Black', 'U', 42.99, 5.04),

-- SNK-002  Pro Anti-Fog Snorkel Mask  (S/M/L × Clear/Black)
('SNK-002-S-CLR',   'SNK-002', 'S', 'Clear', 'U', 58.00, 6.11),
('SNK-002-M-CLR',   'SNK-002', 'M', 'Clear', 'U', 58.00, 5.75),
('SNK-002-L-CLR',   'SNK-002', 'L', 'Clear', 'U', 58.00, 5.91),
('SNK-002-S-BLK',   'SNK-002', 'S', 'Black', 'U', 58.00, 5.64),
('SNK-002-M-BLK',   'SNK-002', 'M', 'Black', 'U', 58.00, 5.95),
('SNK-002-L-BLK',   'SNK-002', 'L', 'Black', 'U', 58.00, 6.26),

-- SNK-003  Junior Snorkel Set (Kids)  (Age 4-7 / 8-12 × Aqua/Pink)
('SNK-003-K4-7-AQUA',  'SNK-003', 'Age 4-7',  'Aqua', 'U', 34.99, 3.87),
('SNK-003-K4-7-PINK',  'SNK-003', 'Age 4-7',  'Pink', 'U', 34.99, 3.89),
('SNK-003-K8-12-AQUA', 'SNK-003', 'Age 8-12', 'Aqua', 'U', 34.99, 3.79),
('SNK-003-K8-12-PINK', 'SNK-003', 'Age 8-12', 'Pink', 'U', 34.99, 3.81),

-- SNK-004  Adult Snorkel Set  (S/M/L, Black)
('SNK-004-S',    'SNK-004', 'S', 'Black', 'U', 64.99, 7.25),
('SNK-004-M',    'SNK-004', 'M', 'Black', 'U', 64.99, 7.04),
('SNK-004-L',    'SNK-004', 'L', 'Black', 'U', 64.99, 7.04),

-- FIN-001  Open-Heel Dive Fins  (S/M/L/XL, Black)
('FIN-001-S',    'FIN-001', 'S (W6-7)',          'Black', 'U', 79.00, 6.12),
('FIN-001-M',    'FIN-001', 'M (W8-9 / M7-8)',   'Black', 'U', 79.00, 6.22),
('FIN-001-L',    'FIN-001', 'L (M9-10)',          'Black', 'U', 79.00, 6.10),
('FIN-001-XL',   'FIN-001', 'XL (M11-12)',        'Black', 'U', 79.00, 6.42),

-- FIN-002  Travel Snorkel Fins  (S/M/L/XL, Black)
('FIN-002-S',    'FIN-002', 'S (W6-7)',          'Black', 'U', 49.99, 4.84),
('FIN-002-M',    'FIN-002', 'M (W8-9 / M7-8)',   'Black', 'U', 49.99, 5.10),
('FIN-002-L',    'FIN-002', 'L (M9-10)',          'Black', 'U', 49.99, 4.50),
('FIN-002-XL',   'FIN-002', 'XL (M11-12)',        'Black', 'U', 49.99, 5.10),

-- FIN-003  Kids Swim Fins  (Kids S/M, Aqua)
('FIN-003-S',    'FIN-003', 'Kids S', 'Aqua', 'U', 29.99, 3.46),
('FIN-003-M',    'FIN-003', 'Kids M', 'Aqua', 'U', 29.99, 2.64),

-- WET-001  3mm Shorty Wetsuit  (S/M/L/XL × Men/Women, Black)
('WET-001-S-M',  'WET-001', 'S',  'Black', 'M', 109.00,  9.67),
('WET-001-S-W',  'WET-001', 'S',  'Black', 'W', 109.00, 10.28),
('WET-001-M-M',  'WET-001', 'M',  'Black', 'M', 109.00, 10.21),
('WET-001-M-W',  'WET-001', 'M',  'Black', 'W', 109.00,  9.80),
('WET-001-L-M',  'WET-001', 'L',  'Black', 'M', 109.00,  9.68),
('WET-001-L-W',  'WET-001', 'L',  'Black', 'W', 109.00, 10.10),
('WET-001-XL-M', 'WET-001', 'XL', 'Black', 'M', 109.00, 10.49),
('WET-001-XL-W', 'WET-001', 'XL', 'Black', 'W', 109.00, 10.32),

-- WET-002  Rashguard Long Sleeve  (S/M/L/XL × Navy(Men)/Coral(Women))
('WET-002-S-M',  'WET-002', 'S',  'Navy',  'M', 32.99, null),
('WET-002-S-W',  'WET-002', 'S',  'Coral', 'W', 32.99, null),
('WET-002-M-M',  'WET-002', 'M',  'Navy',  'M', 32.99, null),
('WET-002-M-W',  'WET-002', 'M',  'Coral', 'W', 32.99, null),
('WET-002-L-M',  'WET-002', 'L',  'Navy',  'M', 32.99, null),
('WET-002-L-W',  'WET-002', 'L',  'Coral', 'W', 32.99, null),
('WET-002-XL-M', 'WET-002', 'XL', 'Navy',  'M', 32.99, null),
('WET-002-XL-W', 'WET-002', 'XL', 'Coral', 'W', 32.99, null),

-- BCH-003  Beach Towel Tropical Print  (Standard × 3 prints)
('BCH-003-SUNSET', 'BCH-003', 'Standard', 'Sunset Print', 'U', 24.99, 3.26),
('BCH-003-REEF',   'BCH-003', 'Standard', 'Reef Print',   'U', 24.99, 2.95),
('BCH-003-PALM',   'BCH-003', 'Standard', 'Palm Print',   'U', 24.99, 3.41),

-- BCH-004  Microfiber Quick-Dry Towel  (M/L × Blue/Coral/Black)
('BCH-004-M-BLU', 'BCH-004', 'M (60×120 cm)', 'Blue',  'U', 28.00, 3.35),
('BCH-004-L-BLU', 'BCH-004', 'L (80×160 cm)', 'Blue',  'U', 28.00, 3.43),
('BCH-004-M-CRL', 'BCH-004', 'M (60×120 cm)', 'Coral', 'U', 28.00, 2.70),
('BCH-004-L-CRL', 'BCH-004', 'L (80×160 cm)', 'Coral', 'U', 28.00, 3.38),
('BCH-004-M-BLK', 'BCH-004', 'M (60×120 cm)', 'Black', 'U', 28.00, 3.39),
('BCH-004-L-BLK', 'BCH-004', 'L (80×160 cm)', 'Black', 'U', 28.00, 2.85),

-- BCH-009  Polarized Sunglasses  (One Size × 6 styles)
('BCH-009-AVI-BLK', 'BCH-009', 'One Size', 'Aviator / Black',          'M', 39.99, null),
('BCH-009-AVI-GLD', 'BCH-009', 'One Size', 'Aviator / Gold',           'U', 39.99, null),
('BCH-009-WAY-BLK', 'BCH-009', 'One Size', 'Wayfarer / Black',         'U', 39.99, null),
('BCH-009-WAY-TOR', 'BCH-009', 'One Size', 'Wayfarer / Tortoise',      'U', 39.99, null),
('BCH-009-SPT-BLK', 'BCH-009', 'One Size', 'Sport / Black',            'M', 39.99, null),
('BCH-009-CAT-TOR', 'BCH-009', 'One Size', 'Cat-Eye / Tortoise',       'W', 39.99, null),

-- BCH-011  Reef Walker Water Shoes  (sizes × Black/Aqua)
('BCH-011-W6-7',   'BCH-011', 'W6-7',      'Black', 'W', 38.00, 2.74),
('BCH-011-W8-9',   'BCH-011', 'W8-9',      'Black', 'W', 38.00, 2.62),
('BCH-011-M9-10',  'BCH-011', 'M9-10',     'Black', 'M', 38.00, 2.50),
('BCH-011-M11-12', 'BCH-011', 'M11-12',    'Black', 'M', 38.00, 2.74),
('BCH-011-K2-4',   'BCH-011', 'Kids 2-4',  'Aqua',  'U', 38.00, 2.72),

-- BCH-012  Cooler Bag  (3 sizes — prices vary)
('BCH-012-16L', 'BCH-012', '16 L', 'Blue', 'U', 44.00, 4.68),
('BCH-012-24L', 'BCH-012', '24 L', 'Blue', 'U', 58.00, 4.77),
('BCH-012-40L', 'BCH-012', '40 L', 'Blue', 'U', 79.00, 5.09),

-- SUR-003  Beginner Foam Surfboard  (7'0 / 8'0 / 9'0, Blue)
('SUR-003-7FT', 'SUR-003', '7''0', 'Blue', 'U', 279.00, 15.48),
('SUR-003-8FT', 'SUR-003', '8''0', 'Blue', 'U', 279.00, 14.75),
('SUR-003-9FT', 'SUR-003', '9''0', 'Blue', 'U', 279.00, 15.37),

-- SUR-004  Surf Leash  (6 / 7 / 8 / 9 ft, Black)
('SUR-004-6FT', 'SUR-004', '6 ft', 'Black', 'U', 22.50, null),
('SUR-004-7FT', 'SUR-004', '7 ft', 'Black', 'U', 22.50, null),
('SUR-004-8FT', 'SUR-004', '8 ft', 'Black', 'U', 22.50, null),
('SUR-004-9FT', 'SUR-004', '9 ft', 'Black', 'U', 22.50, null),

-- SUR-006  Skim Board Pro  (Youth / Adult, Tropical)
('SUR-006-YTH', 'SUR-006', 'Youth', 'Tropical', 'U',  89.00, 12.11),
('SUR-006-ADL', 'SUR-006', 'Adult', 'Tropical', 'U',  89.00, 11.80),

-- KIT-001  Beginner Kitesurf Kit  (7 / 9 / 12 m2, different colors)
('KIT-001-7M',  'KIT-001', '7 m²',  'Red',    'U', 1099.00, null),
('KIT-001-9M',  'KIT-001', '9 m²',  'Blue',   'U', 1099.00, null),
('KIT-001-12M', 'KIT-001', '12 m²', 'Yellow', 'U', 1099.00, null),

-- KIT-002  Kitesurf Harness  (S/M/L/XL, Black)
('KIT-002-S',   'KIT-002', 'S',  'Black', 'U', 139.00, null),
('KIT-002-M',   'KIT-002', 'M',  'Black', 'U', 139.00, null),
('KIT-002-L',   'KIT-002', 'L',  'Black', 'U', 139.00, null),
('KIT-002-XL',  'KIT-002', 'XL', 'Black', 'U', 139.00, null),

-- APP-001  Tide & Tempo Logo Tee  (XS/S/M/L/XL × Men/Women, Teal)
('APP-001-XS-M', 'APP-001', 'XS', 'Teal', 'M', 24.99, null),
('APP-001-XS-W', 'APP-001', 'XS', 'Teal', 'W', 24.99, null),
('APP-001-S-M',  'APP-001', 'S',  'Teal', 'M', 24.99, null),
('APP-001-S-W',  'APP-001', 'S',  'Teal', 'W', 24.99, null),
('APP-001-M-M',  'APP-001', 'M',  'Teal', 'M', 24.99, null),
('APP-001-M-W',  'APP-001', 'M',  'Teal', 'W', 24.99, null),
('APP-001-L-M',  'APP-001', 'L',  'Teal', 'M', 24.99, null),
('APP-001-L-W',  'APP-001', 'L',  'Teal', 'W', 24.99, null),
('APP-001-XL-M', 'APP-001', 'XL', 'Teal', 'M', 24.99, null),
('APP-001-XL-W', 'APP-001', 'XL', 'Teal', 'W', 24.99, null),

-- APP-002  Apo Island Souvenir Tee  (XS/S/M/L/XL × Men/Women, Sand)
('APP-002-XS-M', 'APP-002', 'XS', 'Sand', 'M', 26.99, null),
('APP-002-XS-W', 'APP-002', 'XS', 'Sand', 'W', 26.99, null),
('APP-002-S-M',  'APP-002', 'S',  'Sand', 'M', 26.99, null),
('APP-002-S-W',  'APP-002', 'S',  'Sand', 'W', 26.99, null),
('APP-002-M-M',  'APP-002', 'M',  'Sand', 'M', 26.99, null),
('APP-002-M-W',  'APP-002', 'M',  'Sand', 'W', 26.99, null),
('APP-002-L-M',  'APP-002', 'L',  'Sand', 'M', 26.99, null),
('APP-002-L-W',  'APP-002', 'L',  'Sand', 'W', 26.99, null),
('APP-002-XL-M', 'APP-002', 'XL', 'Sand', 'M', 26.99, null),
('APP-002-XL-W', 'APP-002', 'XL', 'Sand', 'W', 26.99, null),

-- APP-003  Boardshorts — Mens  (waist 28-40, Navy)
('APP-003-28',   'APP-003', '28', 'Navy', 'M', 44.99, null),
('APP-003-30',   'APP-003', '30', 'Navy', 'M', 44.99, null),
('APP-003-32',   'APP-003', '32', 'Navy', 'M', 44.99, null),
('APP-003-34',   'APP-003', '34', 'Navy', 'M', 44.99, null),
('APP-003-36',   'APP-003', '36', 'Navy', 'M', 44.99, null),
('APP-003-38',   'APP-003', '38', 'Navy', 'M', 44.99, null),
('APP-003-40',   'APP-003', '40', 'Navy', 'M', 44.99, null),

-- APP-004  Bikini Set — Womens  (XS/S/M/L/XL × 4 colors)
('APP-004-XS-COR', 'APP-004', 'XS', 'Coral',          'W', 54.00, null),
('APP-004-XS-AQU', 'APP-004', 'XS', 'Aqua',           'W', 54.00, null),
('APP-004-XS-BLA', 'APP-004', 'XS', 'Black',          'W', 54.00, null),
('APP-004-XS-TRO', 'APP-004', 'XS', 'Tropical Print', 'W', 54.00, null),
('APP-004-S-COR',  'APP-004', 'S',  'Coral',          'W', 54.00, null),
('APP-004-S-AQU',  'APP-004', 'S',  'Aqua',           'W', 54.00, null),
('APP-004-S-BLA',  'APP-004', 'S',  'Black',          'W', 54.00, null),
('APP-004-S-TRO',  'APP-004', 'S',  'Tropical Print', 'W', 54.00, null),
('APP-004-M-COR',  'APP-004', 'M',  'Coral',          'W', 54.00, null),
('APP-004-M-AQU',  'APP-004', 'M',  'Aqua',           'W', 54.00, null),
('APP-004-M-BLA',  'APP-004', 'M',  'Black',          'W', 54.00, null),
('APP-004-M-TRO',  'APP-004', 'M',  'Tropical Print', 'W', 54.00, null),
('APP-004-L-COR',  'APP-004', 'L',  'Coral',          'W', 54.00, null),
('APP-004-L-AQU',  'APP-004', 'L',  'Aqua',           'W', 54.00, null),
('APP-004-L-BLA',  'APP-004', 'L',  'Black',          'W', 54.00, null),
('APP-004-L-TRO',  'APP-004', 'L',  'Tropical Print', 'W', 54.00, null),
('APP-004-XL-COR', 'APP-004', 'XL', 'Coral',          'W', 54.00, null),
('APP-004-XL-AQU', 'APP-004', 'XL', 'Aqua',           'W', 54.00, null),
('APP-004-XL-BLA', 'APP-004', 'XL', 'Black',          'W', 54.00, null),
('APP-004-XL-TRO', 'APP-004', 'XL', 'Tropical Print', 'W', 54.00, null),

-- APP-005  One-Piece Swimsuit  (S/M/L/XL × Black/Navy/Coral)
('APP-005-S-BLA',  'APP-005', 'S',  'Black', 'W', 58.00, null),
('APP-005-S-NAV',  'APP-005', 'S',  'Navy',  'W', 58.00, null),
('APP-005-S-COR',  'APP-005', 'S',  'Coral', 'W', 58.00, null),
('APP-005-M-BLA',  'APP-005', 'M',  'Black', 'W', 58.00, null),
('APP-005-M-NAV',  'APP-005', 'M',  'Navy',  'W', 58.00, null),
('APP-005-M-COR',  'APP-005', 'M',  'Coral', 'W', 58.00, null),
('APP-005-L-BLA',  'APP-005', 'L',  'Black', 'W', 58.00, null),
('APP-005-L-NAV',  'APP-005', 'L',  'Navy',  'W', 58.00, null),
('APP-005-L-COR',  'APP-005', 'L',  'Coral', 'W', 58.00, null),
('APP-005-XL-BLA', 'APP-005', 'XL', 'Black', 'W', 58.00, null),
('APP-005-XL-NAV', 'APP-005', 'XL', 'Navy',  'W', 58.00, null),
('APP-005-XL-COR', 'APP-005', 'XL', 'Coral', 'W', 58.00, null),

-- APP-006  UV Hat Wide Brim  (S/M × Natural/Black)
('APP-006-SM-NAT',  'APP-006', 'S/M',  'Natural', 'U', 28.00, null),
('APP-006-SM-BLK',  'APP-006', 'S/M',  'Black',   'U', 28.00, null),
('APP-006-LXL-NAT', 'APP-006', 'L/XL', 'Natural', 'U', 28.00, null),
('APP-006-LXL-BLK', 'APP-006', 'L/XL', 'Black',   'U', 28.00, null),

-- APP-007  Flip Flops Tropical  (5 sizes, Tropical)
('APP-007-W6-7',   'APP-007', 'W6-7',   'Tropical', 'W', 14.99, null),
('APP-007-W8-9',   'APP-007', 'W8-9',   'Tropical', 'W', 14.99, null),
('APP-007-M9-10',  'APP-007', 'M9-10',  'Tropical', 'M', 14.99, null),
('APP-007-M11-12', 'APP-007', 'M11-12', 'Tropical', 'M', 14.99, null),
('APP-007-K2-4',   'APP-007', 'K2-4',   'Tropical', 'U', 14.99, null)

on conflict (sku) do update set
  parent_sku  = excluded.parent_sku,
  size        = excluded.size,
  color       = excluded.color,
  gender      = excluded.gender,
  unit_price  = excluded.unit_price,
  rental_rate = excluded.rental_rate;
