import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
});

function mapRow(row) {
  if (!row) return null;

  return {
    booking_id: row.booking_id,
    booking_date: row.booking_date,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
    firstname: row.firstname,
    lastname: row.lastname,
    persons: row.persons,
    laundry_package: row.laundry_package,
    club_name: row.club_name,
    channel_id: row.channel_id,
    channel_name: row.channel_name,
    overview_message_id: row.overview_message_id,
    cleaning_overview_message_id: row.cleaning_overview_message_id,
    cleaning_select_message_id: row.cleaning_select_message_id,
    cleaning_detail_message_id: row.cleaning_detail_message_id,
    assignee: row.assignee,
    cleaning_checklist: row.cleaning_checklist,
    reminders_sent: row.reminders_sent,
    archived: row.archived,
    created_at: row.created_at?.toISOString?.() || row.created_at,
    updated_at: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export async function loadBookings() {
  const res = await pool.query(`SELECT * FROM bookings ORDER BY created_at ASC`);
  return res.rows.map(mapRow);
}

export async function saveBookings() {
  throw new Error("saveBookings is not supported for postgres storage");
}

export async function getBooking(bookingId) {
  const res = await pool.query(
    `SELECT * FROM bookings WHERE booking_id = $1 LIMIT 1`,
    [String(bookingId)]
  );
  return mapRow(res.rows[0]);
}

export async function getBookingByChannelId(channelId) {
  if (!channelId) return null;

  const res = await pool.query(
    `SELECT * FROM bookings WHERE channel_id = $1 LIMIT 1`,
    [String(channelId)]
  );
  return mapRow(res.rows[0]);
}

export async function upsertBooking(entry) {
  const now = new Date().toISOString();

  const values = {
    booking_id: String(entry.booking_id),
    booking_date: entry.booking_date ?? null,
    start_date: entry.start_date,
    end_date: entry.end_date,
    start_time: entry.start_time ?? null,
    end_time: entry.end_time ?? null,
    firstname: entry.firstname ?? null,
    lastname: entry.lastname ?? null,
    persons: entry.persons ?? null,
    laundry_package: entry.laundry_package ?? null,
    club_name: entry.club_name ?? null,
    channel_id: entry.channel_id ?? null,
    channel_name: entry.channel_name ?? null,
    overview_message_id: entry.overview_message_id ?? null,
    cleaning_overview_message_id: entry.cleaning_overview_message_id ?? null,
    cleaning_select_message_id: entry.cleaning_select_message_id ?? null,
    cleaning_detail_message_id: entry.cleaning_detail_message_id ?? null,
    assignee: entry.assignee ?? null,
    cleaning_checklist: entry.cleaning_checklist ?? {},
    reminders_sent: entry.reminders_sent ?? {},
    archived: entry.archived ?? false,
    updated_at: now,
    created_at: entry.created_at ?? now,
  };

  const res = await pool.query(
    `
    INSERT INTO bookings (
      booking_id,
      booking_date,
      start_date,
      end_date,
      start_time,
      end_time,
      firstname,
      lastname,
      persons,
      laundry_package,
      club_name,
      channel_id,
      channel_name,
      overview_message_id,
      cleaning_overview_message_id,
      cleaning_select_message_id,
      cleaning_detail_message_id,
      assignee,
      cleaning_checklist,
      reminders_sent,
      archived,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17,
      $18::jsonb, $19::jsonb, $20::jsonb,
      $21, $22::timestamptz, $23::timestamptz
    )
    ON CONFLICT (booking_id) DO UPDATE SET
      booking_date = EXCLUDED.booking_date,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      firstname = EXCLUDED.firstname,
      lastname = EXCLUDED.lastname,
      persons = EXCLUDED.persons,
      laundry_package = EXCLUDED.laundry_package,
      club_name = EXCLUDED.club_name,
      channel_id = EXCLUDED.channel_id,
      channel_name = EXCLUDED.channel_name,
      overview_message_id = EXCLUDED.overview_message_id,
      cleaning_overview_message_id = EXCLUDED.cleaning_overview_message_id,
      cleaning_select_message_id = EXCLUDED.cleaning_select_message_id,
      cleaning_detail_message_id = EXCLUDED.cleaning_detail_message_id,
      assignee = EXCLUDED.assignee,
      cleaning_checklist = EXCLUDED.cleaning_checklist,
      reminders_sent = EXCLUDED.reminders_sent,
      archived = EXCLUDED.archived,
      updated_at = EXCLUDED.updated_at
    RETURNING *
    `,
    [
      values.booking_id,
      values.booking_date,
      values.start_date,
      values.end_date,
      values.start_time,
      values.end_time,
      values.firstname,
      values.lastname,
      values.persons,
      values.laundry_package,
      values.club_name,
      values.channel_id,
      values.channel_name,
      values.overview_message_id,
      values.cleaning_overview_message_id,
      values.cleaning_select_message_id,
      values.cleaning_detail_message_id,
      JSON.stringify(values.assignee),
      JSON.stringify(values.cleaning_checklist),
      JSON.stringify(values.reminders_sent),
      values.archived,
      values.created_at,
      values.updated_at,
    ]
  );

  return mapRow(res.rows[0]);
}

export async function updateBooking(bookingId, patch) {
  const current = await getBooking(bookingId);
  if (!current) return null;

  const merged = {
    ...current,
    ...patch,
    booking_id: String(bookingId),
    updated_at: new Date().toISOString(),
  };

  return upsertBooking(merged);
}

export async function markReminderSent(bookingId, daysBefore) {
  const current = await getBooking(bookingId);
  if (!current) return null;

  const reminders = { ...(current.reminders_sent || {}) };
  reminders[String(daysBefore)] = new Date().toISOString();

  return upsertBooking({
    ...current,
    reminders_sent: reminders,
    updated_at: new Date().toISOString(),
  });
}

export async function closeStore() {
  await pool.end();
}