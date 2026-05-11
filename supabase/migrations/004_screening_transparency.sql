-- Add transparency columns to screenings
ALTER TABLE screenings
  ADD COLUMN passed BOOLEAN DEFAULT true,
  ADD COLUMN failure_reason TEXT,
  ADD COLUMN is_owned BOOLEAN DEFAULT false;

-- Indexes for efficient history queries
CREATE INDEX idx_screenings_ins_date ON screenings(ins_id, screened_at);
CREATE INDEX idx_screenings_passed ON screenings(passed, screened_at);
