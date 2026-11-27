import test from "node:test";
import assert from "node:assert/strict";

import { createOrUpdateBookingFromWebhook } from "../src/services/bookingService.js";

function message(id = "message-1") {
  return {
    id,
    author: { id: "bot-1" },
    content: "",
    edit: async () => {},
    pin: async () => {},
    unpin: async () => {},
  };
}

test("webhook updates preserve notes and cleaning state on existing bookings", async () => {
  let current = {
    booking_id: "booking-1",
    channel_id: "channel-1",
    channel_name: "2026-12-01-booking-1",
    overview_message_id: "overview-1",
    cleaning_overview_message_id: "cleaning-1",
    cleaning_select_message_id: "select-1",
    assignee: { user_id: "staff-1", display_name: "Betreuer" },
    cleaning_checklist: {
      version: 1,
      meta: {
        completed: false,
        notes: [{ id: "note-1", type: "sonderwunsch", text: "Beamer" }],
      },
      areas: {},
    },
  };
  let updated;
  let updatePatch;
  const msg = message();
  const channel = {
    id: "channel-1",
    name: current.channel_name,
    topic: "",
    isTextBased: () => true,
    setTopic: async () => {},
    send: async () => msg,
    messages: {
      fetch: async (id) => typeof id === "string" ? msg : [],
      fetchPins: async () => [],
    },
    guild: {
      members: {
        cache: { size: 1, filter: () => [] },
        fetch: async () => {},
      },
    },
  };
  const store = {
    getBooking: async () => current,
    updateBooking: async (_id, patch) => {
      updatePatch = patch;
      current = { ...current, ...patch };
      updated = current;
      return current;
    },
  };
  const client = {
    user: { id: "bot-1" },
    guilds: {
      fetch: async () => ({
        members: { fetchMe: async () => ({ permissions: { has: () => true } }) },
      }),
    },
    channels: { fetch: async () => channel },
  };

  await createOrUpdateBookingFromWebhook({
    body: {
      booking_id: "booking-1",
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      firstname: "Neu",
      lastname: "Name",
      persons: 8,
    },
    client,
    store,
    audit: { log: async () => {} },
  });

  assert.deepEqual(updated.assignee, { user_id: "staff-1", display_name: "Betreuer" });
  assert.equal(updated.cleaning_checklist.meta.notes[0].text, "Beamer");
  assert.equal(updated.overview_message_id, "overview-1");
  assert.equal(Object.hasOwn(updatePatch, "cleaning_checklist"), false);
  assert.equal(Object.hasOwn(updatePatch, "assignee"), false);
});
