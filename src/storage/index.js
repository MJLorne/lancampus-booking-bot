import * as jsonStore from "./jsonBookingStore.js";
import * as postgresStore from "./postgresBookingStore.js";
import { config } from "../config.js";

export function getStore() {
  return config.storageDriver === "postgres" ? postgresStore : jsonStore;
}