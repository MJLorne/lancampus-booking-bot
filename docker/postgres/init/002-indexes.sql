CREATE INDEX IF NOT EXISTS idx_bookings_channel_id
  ON bookings (channel_id);

CREATE INDEX IF NOT EXISTS idx_bookings_archived
  ON bookings (archived);

CREATE INDEX IF NOT EXISTS idx_bookings_start_date
  ON bookings (start_date);