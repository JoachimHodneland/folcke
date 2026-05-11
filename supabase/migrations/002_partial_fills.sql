-- Add partial fill tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN qty_filled INTEGER DEFAULT 0,
  ADD COLUMN avg_fill_price NUMERIC,
  ADD COLUMN last_fill_at TIMESTAMPTZ;

-- Expand status constraint to include PARTIAL
ALTER TABLE public.orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'PLACED'::text,
    'PARTIAL'::text,
    'MATCHED'::text,
    'SOLD'::text,
    'CANCELLED'::text
  ]));

-- Backfill existing MATCHED/SOLD orders with full fill data
UPDATE public.orders
SET qty_filled = qty, avg_fill_price = limit_price
WHERE status IN ('MATCHED', 'SOLD');
