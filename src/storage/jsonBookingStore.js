import fs from "fs/promises";
import { bookingsFile, config } from "../config.js";

let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

function withLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function loadBookings() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(bookingsFile, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveBookings(bookings) {
  await ensureDataDir();
  const tmp = `${bookingsFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(bookings, null, 2), "utf8");
  await fs.rename(tmp, bookingsFile);
}

export async function getBooking(bookingId) {
  const bookings = await loadBookings();
  return bookings.find((b) => String(b.booking_id) === String(bookingId)) || null;
}

export async function getBookingByChannelId(channelId) {
  if (!channelId) return null;
  const bookings = await loadBookings();
  return bookings.find((b) => String(b.channel_id) === String(channelId)) || null;
}

export async function upsertBooking(entry) {
  return withLock(async () => {
    const bookings = await loadBookings();
    const idx = bookings.findIndex((b) => String(b.booking_id) === String(entry.booking_id));
    const now = new Date().toISOString();

    const merged = {
      ...(idx >= 0 ? bookings[idx] : {}),
      ...entry,
      updated_at: now,
      created_at: idx >= 0 ? bookings[idx].created_at : now,
      reminders_sent: idx >= 0 ? (bookings[idx].reminders_sent || {}) : (entry.reminders_sent || {}),
      archived: entry.archived ?? (idx >= 0 ? bookings[idx].archived : false) ?? false,
      cleaning_checklist: entry.cleaning_checklist ?? (idx >= 0 ? bookings[idx].cleaning_checklist : undefined),
    };

    if (idx >= 0) bookings[idx] = merged;
    else bookings.push(merged);

    await saveBookings(bookings);
    return merged;
  });
}

export async function updateBooking(bookingId, patch) {
  return withLock(async () => {
    const bookings = await loadBookings();
    const idx = bookings.findIndex((b) => String(b.booking_id) === String(bookingId));
    if (idx < 0) return null;

    bookings[idx] = {
      ...bookings[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };

    await saveBookings(bookings);
    return bookings[idx];
  });
}

export async function markReminderSent(bookingId, daysBefore) {
  return withLock(async () => {
    const bookings = await loadBookings();
    const idx = bookings.findIndex((b) => String(b.booking_id) === String(bookingId));
    if (idx < 0) return;

    const reminders = { ...(bookings[idx].reminders_sent || {}) };
    reminders[String(daysBefore)] = new Date().toISOString();

    bookings[idx] = {
      ...bookings[idx],
      reminders_sent: reminders,
      updated_at: new Date().toISOString(),
    };

    await saveBookings(bookings);
  });
}