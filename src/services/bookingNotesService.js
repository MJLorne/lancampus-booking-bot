import { randomUUID } from "node:crypto";

import { normalizeCleaningChecklist } from "./cleaningService.js";

const ALLOWED_NOTE_TYPES = new Set(["allgemein", "sonderwunsch", "schaden", "fundsache"]);

export function appendBookingNote(booking, note, { now = () => new Date(), id = randomUUID } = {}) {
  const cleaning = normalizeCleaningChecklist(booking?.cleaning_checklist);
  cleaning.meta ??= {};
  const existingNotes = Array.isArray(cleaning.meta.notes) ? cleaning.meta.notes : [];
  const type = ALLOWED_NOTE_TYPES.has(note?.type) ? note.type : "allgemein";
  const text = String(note?.text || "").trim().slice(0, 500);
  if (!text) throw new Error("Die Notiz darf nicht leer sein.");

  cleaning.meta.notes = [
    ...existingNotes,
    {
      id: id(),
      type,
      text,
      created_by: note?.created_by || null,
      created_by_name: String(note?.created_by_name || "Unbekannt").slice(0, 100),
      created_at: now().toISOString(),
    },
  ].slice(-50);

  return cleaning;
}

export function noteTypeLabel(type) {
  return {
    allgemein: "Notiz",
    sonderwunsch: "Sonderwunsch",
    schaden: "Schaden",
    fundsache: "Fundsache",
  }[type] || "Notiz";
}
