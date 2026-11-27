import test from "node:test";
import assert from "node:assert/strict";

import { registerInteractionHandlers } from "../src/discord/interactions.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createAssigneeFixture({ memberFetch, auditLog = async () => {} }) {
  let handler;
  const client = {
    user: { id: "bot-1" },
    on: (event, callback) => {
      if (event === "interactionCreate") handler = callback;
    },
  };

  const bookingGate = deferred();
  const events = [];
  const message = {
    id: "message-1",
    author: { id: "bot-1" },
    content: "",
    edit: async () => {},
    pin: async () => {},
    unpin: async () => {},
  };
  const booking = {
    booking_id: "booking-1",
    overview_message_id: "message-1",
    cleaning_overview_message_id: "message-1",
    cleaning_select_message_id: "message-1",
    cleaning_checklist: { areas: {}, meta: {} },
  };
  const channel = {
    id: "channel-1",
    topic: "",
    isTextBased: () => true,
    setTopic: async () => {},
    send: async () => message,
    messages: {
      fetch: async () => message,
      fetchPins: async () => [],
    },
    guild: {
      members: {
        cache: { size: 2, filter: () => [] },
        fetch: memberFetch,
      },
    },
  };
  let bookingLookups = 0;
  const store = {
    getBookingByChannelId: async () => {
      bookingLookups += 1;
      if (bookingLookups === 1) await bookingGate.promise;
      return booking;
    },
    getBooking: async () => booking,
    updateBooking: async (_bookingId, updates) => ({ ...booking, ...updates }),
  };

  registerInteractionHandlers(client, {
    store,
    audit: { log: auditLog },
    archiveService: {},
  });

  const interaction = {
    customId: "select_assignee",
    values: ["member-1"],
    channel,
    member: {
      displayName: "Admin",
      roles: { cache: { some: () => true } },
    },
    user: { id: "admin-1", username: "Admin" },
    guild: channel.guild,
    isChatInputCommand: () => false,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isRepliable: () => true,
    deferReply: async () => {
      interaction.deferred = true;
      events.push({ type: "deferReply" });
    },
    editReply: async ({ content }) => events.push({ type: "editReply", content }),
    reply: async ({ content }) => events.push({ type: "reply", content }),
    deferred: false,
    replied: false,
  };

  return {
    handler,
    interaction,
    bookingGate,
    events,
    getBookingLookups: () => bookingLookups,
  };
}

test("assignee selection acknowledges before the initial booking lookup", async () => {
  const memberGate = deferred();
  const fixture = createAssigneeFixture({ memberFetch: async () => memberGate.promise });

  const handling = fixture.handler(fixture.interaction);
  await Promise.resolve();

  assert.deepEqual(fixture.events, [{ type: "deferReply" }]);

  fixture.bookingGate.resolve();
  memberGate.resolve({ id: "member-1", displayName: "Betreuer" });
  await handling;
  assert.deepEqual(fixture.events, [
    { type: "deferReply" },
    { type: "editReply", content: "👤 Betreuer geändert auf **Betreuer**" },
  ]);
  assert.equal(fixture.getBookingLookups(), 1);
});

test("assignee selection completes a deferred reply with an error", async () => {
  const fixture = createAssigneeFixture({
    memberFetch: async () => {
      throw new Error("Discord lookup failed");
    },
  });
  fixture.bookingGate.resolve();

  await fixture.handler(fixture.interaction);

  assert.equal(fixture.events[0]?.type, "deferReply");
  assert.deepEqual(fixture.events.at(-1), {
    type: "editReply",
    content: "❌ Fehler bei der Aktion.",
  });
});

test("assignee selection does not overwrite success after a later failure", async () => {
  const fixture = createAssigneeFixture({
    memberFetch: async () => ({ id: "member-1", displayName: "Betreuer" }),
    auditLog: async () => {
      throw new Error("Audit failed");
    },
  });
  fixture.bookingGate.resolve();

  await fixture.handler(fixture.interaction);

  assert.deepEqual(fixture.events, [
    { type: "deferReply" },
    { type: "editReply", content: "👤 Betreuer geändert auf **Betreuer**" },
  ]);
});
