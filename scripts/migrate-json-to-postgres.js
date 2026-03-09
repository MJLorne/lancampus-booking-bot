import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || "/data";
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || path.join(DATA_DIR, "bookings.json");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL fehlt.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

function normalizeBooking(entry) {
  const now = new Date().toISOString();

  return {
    booking_id: String(entry.booking_id),
    booking_date: entry.booking_date ?? null,
    start_date: entry.start_date ?? null,
    end_date: entry.end_date ?? null,
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
    cleaning_picked_task: entry.cleaning_picked_task ?? {},
    reminders_sent: entry.reminders_sent ?? {},

    archived: entry.archived ?? false,
    created_at: entry.created_at ?? now,
    updated_at: entry.updated_at ?? now,
  };
}

async function readJsonFile() {
  const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.bookings)) {
    return parsed.bookings;
  }

  if (parsed && typeof parsed === "object") {
    return Object.values(parsed);
  }

  throw new Error("Unbekanntes JSON-Format in bookings.json");
}

async function upsertBooking(client, booking) {
  await client.query(
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
      cleaning_picked_task,
      reminders_sent,
      archived,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17,
      $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb,
      $22, $23::timestamptz, $24::timestamptz
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
      cleaning_picked_task = EXCLUDED.cleaning_picked_task,
      reminders_sent = EXCLUDED.reminders_sent,
      archived = EXCLUDED.archived,
      updated_at = EXCLUDED.updated_at
    `,
    [
      booking.booking_id,
      booking.booking_date,
      booking.start_date,
      booking.end_date,
      booking.start_time,
      booking.end_time,
      booking.firstname,
      booking.lastname,
      booking.persons,
      booking.laundry_package,
      booking.club_name,
      booking.channel_id,
      booking.channel_name,
      booking.overview_message_id,
      booking.cleaning_overview_message_id,
      booking.cleaning_select_message_id,
      booking.cleaning_detail_message_id,
      JSON.stringify(booking.assignee),
      JSON.stringify(booking.cleaning_checklist),
      JSON.stringify(booking.cleaning_picked_task),
      JSON.stringify(booking.reminders_sent),
      booking.archived,
      booking.created_at,
      booking.updated_at,
    ]
  );
}

async function main() {
  console.log(`📂 Lese JSON-Datei: ${BOOKINGS_FILE}`);

  const bookings = await readJsonFile();
  console.log(`📦 ${bookings.length} Buchungen gefunden`);

  const validBookings = bookings
    .filter((b) => b && b.booking_id)
    .map(normalizeBooking)
    .filter((b) => b.start_date && b.end_date);

  console.log(`✅ ${validBookings.length} gültige Buchungen werden migriert`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const booking of validBookings) {
      await upsertBooking(client, booking);
      console.log(`➡️  Migriert: ${booking.booking_id}`);
    }

    await client.query("COMMIT");
    console.log("🎉 Migration abgeschlossen");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration fehlgeschlagen:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error("❌ Unerwarteter Fehler:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});