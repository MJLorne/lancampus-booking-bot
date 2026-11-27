import test from "node:test";
import assert from "node:assert/strict";

import { handleChatInputCommand } from "../src/discord/commands.js";
import { appendBookingNote } from "../src/services/bookingNotesService.js";

function createNoteInteraction({ type = "sonderwunsch", text = "Beamer vorbereiten" } = {}) {
  const events = [];
  const interaction = {
    commandName: "notiz",
    channel: { id: "channel-1" },
    member: { displayName: "Lukas" },
    user: { id: "user-1", username: "lukas" },
    options: {
      getString(name) {
        if (name === "typ") return type;
        if (name === "text") return text;
        return null;
      },
    },
    isChatInputCommand: () => true,
    deferReply: async () => events.push("defer"),
    editReply: async (payload) => events.push(payload),
  };
  return { interaction, events };
}

test("/notiz stores a structured note without overwriting an old checklist", async () => {
  const oldChecklist = {
    version: 1,
    meta: { completed: false },
    areas: {
      gaming: {
        label: "Gaming",
        completed: false,
        tasks: { plaetze: { label: "Plätze", done: true } },
      },
    },
  };
  const booking = {
    booking_id: "booking-1",
    cleaning_checklist: oldChecklist,
  };
  let savedChecklist;
  let syncedBooking;
  const store = {
    getBookingByChannelId: async () => booking,
    addBookingNote: async (_id, note) => {
      savedChecklist = appendBookingNote(booking, note);
      return { ...booking, cleaning_checklist: savedChecklist };
    },
  };
  const { interaction, events } = createNoteInteraction();

  const handled = await handleChatInputCommand(interaction, {
    store,
    client: {},
    syncBookingChannelFn: async ({ booking: updated }) => {
      syncedBooking = updated;
    },
  });

  assert.equal(handled, true);
  assert.equal(events[0], "defer");
  assert.equal(savedChecklist.areas.gaming.tasks.plaetze.done, true);
  assert.equal(savedChecklist.meta.notes.length, 1);
  assert.deepEqual(
    {
      type: savedChecklist.meta.notes[0].type,
      text: savedChecklist.meta.notes[0].text,
      created_by: savedChecklist.meta.notes[0].created_by,
      created_by_name: savedChecklist.meta.notes[0].created_by_name,
    },
    {
      type: "sonderwunsch",
      text: "Beamer vorbereiten",
      created_by: "user-1",
      created_by_name: "Lukas",
    }
  );
  assert.equal(syncedBooking.booking_id, "booking-1");
  assert.match(events.at(-1).content, /Sonderwunsch gespeichert/);
});

test("/notiz rejects use outside a booking channel", async () => {
  const { interaction, events } = createNoteInteraction();
  const handled = await handleChatInputCommand(interaction, {
    store: { getBookingByChannelId: async () => null },
    client: {},
  });

  assert.equal(handled, true);
  assert.equal(events[0], "defer");
  assert.match(events.at(-1).content, /keine Buchung gefunden/);
});

test("/notiz finalizes the deferred reply when booking lookup fails", async () => {
  const { interaction, events } = createNoteInteraction();
  const handled = await handleChatInputCommand(interaction, {
    store: {
      getBookingByChannelId: async () => {
        throw new Error("database unavailable");
      },
    },
    client: {},
  });

  assert.equal(handled, true);
  assert.equal(events[0], "defer");
  assert.match(events.at(-1).content, /Notiz konnte nicht gespeichert werden/);
});

test("/notiz reports a saved note separately from a failed overview refresh", async () => {
  const booking = { booking_id: "booking-1", cleaning_checklist: {} };
  let addCalls = 0;
  const { interaction, events } = createNoteInteraction();

  const handled = await handleChatInputCommand(interaction, {
    store: {
      getBookingByChannelId: async () => booking,
      addBookingNote: async () => {
        addCalls += 1;
        return { ...booking, cleaning_checklist: appendBookingNote(booking, {
          type: "sonderwunsch",
          text: "Beamer vorbereiten",
          created_by_name: "Lukas",
        }) };
      },
    },
    client: {},
    syncBookingChannelFn: async () => {
      throw new Error("Discord unavailable");
    },
  });

  assert.equal(handled, true);
  assert.equal(addCalls, 1);
  assert.match(events.at(-1).content, /Sonderwunsch wurde gespeichert/);
  assert.match(events.at(-1).content, /Übersicht konnte nicht aktualisiert werden/);
});
