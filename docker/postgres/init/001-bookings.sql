CREATE TABLE IF NOT EXISTS bookings (
  booking_id TEXT PRIMARY KEY,
  booking_date TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  firstname TEXT,
  lastname TEXT,
  persons INTEGER,
  laundry_package TEXT,
  club_name TEXT,

  channel_id TEXT,
  channel_name TEXT,
  overview_message_id TEXT,
  cleaning_overview_message_id TEXT,
  cleaning_select_message_id TEXT,
  cleaning_detail_message_id TEXT,

  assignee JSONB NOT NULL DEFAULT 'null'::jsonb,
  cleaning_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  cleaning_picked_task JSONB NOT NULL DEFAULT '{}'::jsonb,
  reminders_sent JSONB NOT NULL DEFAULT '{}'::jsonb,

  archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_reason TEXT,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);