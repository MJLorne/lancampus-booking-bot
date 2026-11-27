import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".test-data-booking-notes");
process.env.DATA_DIR = dataDir;
const store = await import("../src/storage/jsonBookingStore.js");

async function resetStore() {
  await fs.rm(dataDir, { recursive: true, force: true });
  await store.saveBookings([{
    booking_id: "booking-1",
    channel_id: "channel-1",
    cleaning_checklist: {},
  }]);
}

test("JSON store keeps concurrent note appends", async () => {
  await resetStore();

  await Promise.all([
    store.addBookingNote("booking-1", { type: "allgemein", text: "Erste", created_by_name: "A" }),
    store.addBookingNote("booking-1", { type: "sonderwunsch", text: "Zweite", created_by_name: "B" }),
  ]);

  const booking = await store.getBooking("booking-1");
  assert.deepEqual(
    booking.cleaning_checklist.meta.notes.map((note) => note.text).sort(),
    ["Erste", "Zweite"]
  );
});

test("JSON store serializes a cleaning mutation with a note append", async () => {
  await resetStore();

  const cleaningUpdate = store.mutateCleaningChecklist("booking-1", async (cleaning) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    cleaning.areas.gaming.tasks.plaetze.done = true;
    return cleaning;
  });
  const noteUpdate = store.addBookingNote("booking-1", {
    type: "schaden",
    text: "Kabel defekt",
    created_by_name: "Team",
  });

  await Promise.all([cleaningUpdate, noteUpdate]);
  const booking = await store.getBooking("booking-1");
  assert.equal(booking.cleaning_checklist.areas.gaming.tasks.plaetze.done, true);
  assert.equal(booking.cleaning_checklist.meta.notes[0].text, "Kabel defekt");
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
