import test from "node:test";
import assert from "node:assert/strict";

import { syncBookingChannel } from "../src/services/bookingService.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createSyncFixture({ channelId = "channel-1" } = {}) {
  const firstGate = deferred();
  const topics = [];
  let firstTopic = true;

  const message = {
    id: "message-1",
    author: { id: "bot-1" },
    edit: async () => {},
    pin: async () => {},
  };

  const channel = {
    id: channelId,
    guild: {
      members: {
        cache: { size: 2, filter: () => [] },
        fetch: async () => {},
      },
    },
    isTextBased: () => true,
    setTopic: async (topic) => {
      topics.push(topic);
      if (firstTopic) {
        firstTopic = false;
        await firstGate.promise;
      }
    },
    messages: {
      fetch: async () => message,
      fetchPins: async () => [message],
    },
    send: async () => message,
  };

  const store = {
    getBooking: async (bookingId) => ({
      booking_id: bookingId,
      overview_message_id: "message-1",
      cleaning_overview_message_id: "message-1",
      cleaning_select_message_id: "message-1",
      cleaning_checklist: { areas: {}, meta: {} },
    }),
    updateBooking: async () => {},
  };

  const makeBooking = (label) => ({
    booking_id: "booking-1",
    firstname: label,
    overview_message_id: "message-1",
  });

  return {
    channel,
    client: { user: { id: "bot-1" } },
    store,
    makeBooking,
    firstGate,
    topics,
  };
}

test("syncBookingChannel serializes and coalesces overlapping syncs per channel", async () => {
  const fixture = createSyncFixture();

  const first = syncBookingChannel({
    channel: fixture.channel,
    booking: fixture.makeBooking("first"),
    client: fixture.client,
    store: fixture.store,
    member: null,
  });
  const second = syncBookingChannel({
    channel: fixture.channel,
    booking: fixture.makeBooking("second"),
    client: fixture.client,
    store: fixture.store,
    member: null,
  });
  const latest = syncBookingChannel({
    channel: fixture.channel,
    booking: fixture.makeBooking("latest"),
    client: fixture.client,
    store: fixture.store,
    member: null,
  });

  await Promise.resolve();
  assert.equal(fixture.topics.length, 1);

  fixture.firstGate.resolve();
  await Promise.all([first, second, latest]);

  assert.equal(fixture.topics.length, 2);
  assert.match(fixture.topics[0], /first/);
  assert.match(fixture.topics[1], /latest/);
});

test("duration telemetry failure does not change a successful sync", async () => {
  const fixture = createSyncFixture({ channelId: "telemetry-success" });
  fixture.firstGate.resolve();
  const originalInfo = console.info;
  console.info = () => { throw new Error("telemetry sink failed"); };

  try {
    const result = await syncBookingChannel({
      channel: fixture.channel,
      booking: fixture.makeBooking("success"),
      client: fixture.client,
      store: fixture.store,
      member: null,
    });
    assert.equal(result, true);
  } finally {
    console.info = originalInfo;
  }
});

test("duration telemetry failure does not mask a sync error", async () => {
  const fixture = createSyncFixture({ channelId: "telemetry-error" });
  fixture.firstGate.resolve();
  fixture.store.getBooking = async () => { throw new Error("sync failed"); };
  const originalInfo = console.info;
  console.info = () => { throw new Error("telemetry sink failed"); };

  try {
    await assert.rejects(
      syncBookingChannel({
        channel: fixture.channel,
        booking: fixture.makeBooking("failure"),
        client: fixture.client,
        store: fixture.store,
        member: null,
      }),
      /sync failed/,
    );
  } finally {
    console.info = originalInfo;
  }
});
