-- Enable Row Level Security on all tables
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Public read access for non-sensitive reference data
CREATE POLICY "public_read" ON markets FOR SELECT USING (true);
CREATE POLICY "public_read" ON instruments FOR SELECT USING (true);
CREATE POLICY "public_read" ON daily_prices FOR SELECT USING (true);
CREATE POLICY "public_read" ON screenings FOR SELECT USING (true);

-- Orders: no policy = denied by default when RLS is enabled.
-- Only service_role (which bypasses RLS) can read/write orders.
-- All order mutations go through the API route using service_role.
