import test from "node:test";
import assert from "node:assert/strict";

import { createKeyedCoalescer } from "../src/utils/keyedCoalescer.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("coalesces overlapping work for the same key into one trailing run", async () => {
  const firstGate = deferred();
  const calls = [];
  const coalesce = createKeyedCoalescer(async (value) => {
    calls.push(value);
    if (value === "first") await firstGate.promise;
    return value;
  });

  const first = coalesce("booking-1", "first");
  const second = coalesce("booking-1", "second");
  const third = coalesce("booking-1", "latest");

  await Promise.resolve();
  assert.deepEqual(calls, ["first"]);

  firstGate.resolve();

  assert.equal(await first, "latest");
  assert.equal(await second, "latest");
  assert.equal(await third, "latest");
  assert.deepEqual(calls, ["first", "latest"]);
});

test("reports how many same-key requests were coalesced", async () => {
  const gate = deferred();
  const events = [];
  const coalesce = createKeyedCoalescer(
    async (value) => {
      if (value === "first") await gate.promise;
      return value;
    },
    {
      onCoalesced: (event) => events.push(event),
    },
  );

  const first = coalesce("booking-1", "first");
  const second = coalesce("booking-1", "second");
  const latest = coalesce("booking-1", "latest");

  assert.deepEqual(events, [
    { key: "booking-1", count: 1 },
    { key: "booking-1", count: 2 },
  ]);

  gate.resolve();
  await Promise.all([first, second, latest]);
});

test("runs the latest pending value after an active worker failure", async () => {
  const gate = deferred();
  const calls = [];
  const coalesce = createKeyedCoalescer(async (value) => {
    calls.push(value);
    if (value === "first") {
      await gate.promise;
      throw new Error("first failed");
    }
    return value;
  });

  const first = coalesce("booking-1", "first");
  const latest = coalesce("booking-1", "latest");
  gate.resolve();

  assert.equal(await first, "latest");
  assert.equal(await latest, "latest");
  assert.deepEqual(calls, ["first", "latest"]);
});

test("does not lose a request at the worker completion boundary", async () => {
  const calls = [];
  const workerPromises = [];
  const coalesce = createKeyedCoalescer((value) => {
    calls.push(value);
    const promise = Promise.resolve(`${value}-result`);
    workerPromises.push(promise);
    return promise;
  });

  const first = coalesce("booking-1", "first");
  let late;
  workerPromises[0].then(() => {
    late = coalesce("booking-1", "latest");
  });

  assert.equal(await first, "first-result");
  assert.equal(await late, "latest-result");
  assert.deepEqual(calls, ["first", "latest"]);
});

test("does not lose a request at a rejected worker completion boundary", async () => {
  const calls = [];
  const workerPromises = [];
  const coalesce = createKeyedCoalescer((value) => {
    calls.push(value);
    const promise = value === "first"
      ? Promise.reject(new Error("first failed"))
      : Promise.resolve(`${value}-result`);
    workerPromises.push(promise);
    return promise;
  });

  const first = coalesce("booking-1", "first");
  let late;
  workerPromises[0].catch(() => {
    late = coalesce("booking-1", "latest");
  });

  await assert.rejects(first, /first failed/);
  assert.equal(await late, "latest-result");
  assert.deepEqual(calls, ["first", "latest"]);
});

test("preserves falsy worker rejection reasons", async (t) => {
  for (const reason of [undefined, null, false, 0, ""]) {
    await t.test(`reason ${String(reason)}`, async () => {
      const coalesce = createKeyedCoalescer(() => Promise.reject(reason));
      const outcome = await coalesce("booking-1", "value").then(
        (value) => ({ resolved: true, value }),
        (error) => ({ resolved: false, error }),
      );

      assert.equal(outcome.resolved, false);
      assert.ok(Object.is(outcome.error, reason));
    });
  }
});

test("telemetry failures do not break coalesced callers", async () => {
  const gate = deferred();
  const calls = [];
  const coalesce = createKeyedCoalescer(
    async (value) => {
      calls.push(value);
      if (value === "first") await gate.promise;
      return value;
    },
    {
      onCoalesced: () => {
        throw new Error("telemetry failed");
      },
    },
  );

  const first = coalesce("booking-1", "first");
  let latest;
  assert.doesNotThrow(() => {
    latest = coalesce("booking-1", "latest");
  });

  gate.resolve();
  assert.equal(await first, "latest");
  assert.equal(await latest, "latest");
  assert.deepEqual(calls, ["first", "latest"]);
});

test("accepts null as a worker payload", async () => {
  const calls = [];
  const coalesce = createKeyedCoalescer(async (value) => {
    calls.push(value);
    return value;
  });

  assert.equal(await coalesce("booking-1", null), null);
  assert.deepEqual(calls, [null]);
});

test("does not discard a coalesced null payload", async () => {
  const gate = deferred();
  const calls = [];
  const coalesce = createKeyedCoalescer(async (value) => {
    calls.push(value);
    if (value === "first") await gate.promise;
    return value;
  });

  const first = coalesce("booking-1", "first");
  const latest = coalesce("booking-1", null);
  gate.resolve();

  assert.equal(await first, null);
  assert.equal(await latest, null);
  assert.deepEqual(calls, ["first", null]);
});

test("asynchronous telemetry rejection does not become unhandled", async () => {
  const gate = deferred();
  const coalesce = createKeyedCoalescer(
    async (value) => {
      if (value === "first") await gate.promise;
      return value;
    },
    { onCoalesced: async () => { throw new Error("async telemetry failed"); } },
  );

  const first = coalesce("booking-1", "first");
  const latest = coalesce("booking-1", "latest");
  gate.resolve();

  assert.equal(await first, "latest");
  assert.equal(await latest, "latest");
  await new Promise((resolve) => setImmediate(resolve));
});

test("rejects same-key worker reentrancy instead of deadlocking", async () => {
  let coalesce;
  coalesce = createKeyedCoalescer(async (value) => {
    if (value === "outer") return coalesce("booking-1", "inner");
    return value;
  });

  const bounded = Promise.race([
    coalesce("booking-1", "outer"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("deadlocked")), 50)),
  ]);

  await assert.rejects(bounded, /reentrant|reentrancy/i);
});
