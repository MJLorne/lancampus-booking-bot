import { AsyncLocalStorage } from "node:async_hooks";

export function createKeyedCoalescer(worker, { onCoalesced } = {}) {
  const active = new Map();
  const empty = Symbol("no pending work");
  const workerContext = new AsyncLocalStorage();

  return function coalesce(key, value) {
    const context = workerContext.getStore();
    if (context?.key === key && active.get(key) === context.state) {
      return Promise.reject(new Error(`Keyed coalescer reentrancy for key ${String(key)}`));
    }

    const current = active.get(key);
    if (current) {
      current.pending = value;
      current.coalesced += 1;
      if (onCoalesced) {
        try {
          void Promise.resolve(onCoalesced({ key, count: current.coalesced })).catch(() => {});
        } catch {}
      }
      return current.promise;
    }

    let resolveShared;
    let rejectShared;
    const promise = new Promise((resolve, reject) => {
      resolveShared = resolve;
      rejectShared = reject;
    });
    const state = { pending: empty, promise, coalesced: 0 };
    active.set(key, state);

    const drain = async () => {
      let next = value;
      let result;
      let failure;
      let failed = false;

      while (next !== empty) {
        state.pending = empty;
        try {
          result = await workerContext.run(
            { key, state },
            () => worker(next),
          );
          failure = null;
          failed = false;
        } catch (err) {
          failure = err;
          failed = true;
        }
        next = state.pending;
      }

      active.delete(key);
      if (failed) rejectShared(failure);
      else resolveShared(result);
    };

    drain().catch((err) => {
      if (active.get(key) === state) active.delete(key);
      rejectShared(err);
    });

    return promise;
  };
}
