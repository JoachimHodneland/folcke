create table markets (
  id integer primary key,
  name text not null,
  active boolean default true
);

create table instruments (
  ins_id integer primary key,
  ticker text not null,
  name text not null,
  market_id integer references markets(id),
  currency text default 'SEK',
  sector text,
  industry text,
  last_screened_at timestamptz
);

create table daily_prices (
  ins_id integer references instruments(ins_id),
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume bigint,
  primary key (ins_id, date)
);
create index on daily_prices (date);

create table screenings (
  id uuid primary key default gen_random_uuid(),
  screened_at timestamptz default now(),
  ins_id integer references instruments(ins_id),
  last_close numeric,
  spread_pct numeric,
  avg_turnover_30d numeric,
  trend_1m_pct numeric,
  trend_3m_pct numeric,
  support_level numeric,
  support_touches integer,
  resistance_level numeric,
  resistance_touches integer,
  range_width_pct numeric,
  score numeric,
  suggested_buy_price numeric,
  suggested_sell_price numeric,
  suggested_qty integer,
  suggested_position_sek numeric,
  rank integer
);
create index on screenings (screened_at desc, rank);

create table orders (
  id uuid primary key default gen_random_uuid(),
  ins_id integer references instruments(ins_id),
  side text check (side in ('BUY', 'SELL')),
  limit_price numeric,
  qty integer,
  status text check (status in ('PLACED', 'MATCHED', 'SOLD', 'CANCELLED')),
  placed_at timestamptz default now(),
  matched_at timestamptz,
  closed_at timestamptz,
  pair_id uuid,
  pnl_sek numeric,
  notes text
);
