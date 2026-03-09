import * as jsonStore from "./jsonBookingStore.js";
import * as postgresStore from "./postgresBookingStore.js";

const driver = process.env.STORAGE_DRIVER || "json";

export function getStore() {
  if (driver === "postgres") {
    return postgresStore;
  }

  return jsonStore;
}