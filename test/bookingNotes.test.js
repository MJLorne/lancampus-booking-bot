import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskControls,
  defaultCleaningChecklist,
  normalizeCleaningChecklist,
  renderCleaningOverviewText,
} from "../src/services/cleaningService.js";
import { appendBookingNote } from "../src/services/bookingNotesService.js";

test("renders one LanCampus overview for assignee, notes, and cleaning", () => {
  const cleaning = defaultCleaningChecklist();
  cleaning.meta.notes = [
    {
      id: "note-1",
      type: "sonderwunsch",
      text: "Bitte den Beamer vorbereiten",
      created_by_name: "Lukas",
      created_at: "2026-11-27T20:00:00.000Z",
    },
  ];
  const booking = {
    assignee: { user_id: "123456789012345678", display_name: "Max" },
    cleaning_checklist: cleaning,
  };

  const text = renderCleaningOverviewText(cleaning, booking);

  assert.match(text, /LanCampus – Organisation/);
  assert.match(text, /Betreuer & Reinigung:\*\* <@123456789012345678>/);
  assert.match(text, /Sonderwunsch:\*\* Bitte den Beamer vorbereiten/);
  assert.match(text, /von Lukas/);
  assert.match(text, /Reinigung/);
});

test("keeps the cleaning status visible when many long notes exist", () => {
  const cleaning = defaultCleaningChecklist();
  cleaning.meta.notes = Array.from({ length: 12 }, (_, index) => ({
    id: `note-${index}`,
    type: "allgemein",
    text: `Notiz ${index} ${"x".repeat(500)}`,
    created_by_name: "Team",
  }));

  const text = renderCleaningOverviewText(cleaning, {});

  assert.ok(text.length <= 2000);
  assert.match(text, /🧹 \*\*Reinigung:\*\*/);
  assert.match(text, /Gaming/);
});


test("renders old bookings without note metadata", () => {
  const oldCleaning = {
    version: 1,
    meta: { completed: false },
    areas: {
      gaming: { label: "Gaming", icon: "🖥️", completed: false, tasks: {} },
    },
  };

  const text = renderCleaningOverviewText(oldCleaning, {
    assignee: { display_name: "Alter Betreuer" },
  });

  assert.match(text, /Betreuer & Reinigung:\*\* Alter Betreuer/);
  assert.match(text, /Keine Notizen hinterlegt/);
  assert.match(text, /⬜ 🖥️ Gaming/);
});

test("hydrates a legacy empty checklist before adding a note", () => {
  const cleaning = appendBookingNote(
    { booking_id: "legacy", cleaning_checklist: {} },
    { type: "allgemein", text: "Altbestand", created_by_name: "Team" },
    { now: () => new Date("2026-11-27T20:00:00.000Z"), id: () => "note-1" }
  );

  assert.equal(Object.keys(cleaning.areas).length, 8);
  assert.equal(cleaning.meta.completed, false);
  assert.equal(cleaning.meta.notes[0].text, "Altbestand");
  assert.ok(Object.keys(cleaning.areas.gaming.tasks).length > 0);
});

test("deeply hydrates partial legacy task objects", () => {
  const cleaning = normalizeCleaningChecklist({
    meta: { completed: false },
    areas: {
      gaming: {
        completed: false,
        tasks: { plaetze: { done: true } },
      },
    },
  });

  assert.equal(cleaning.areas.gaming.tasks.plaetze.done, true);
  assert.equal(cleaning.areas.gaming.tasks.plaetze.label, "Plätze aufräumen und putzen");
  assert.doesNotThrow(() => buildTaskControls("gaming", cleaning.areas.gaming));
});
