/**
 * Migration: Update cleaning checklist labels for existing bookings.
 *
 * Changes:
 *   kueche.muelleimer:  "Mülleimer leeren"        → "Mülleimer leeren und reinigen"
 *   schlafzimmer.schraenke:  "Schränke kontrollieren"  → "Schränke kontrollieren und reinigen"
 *   schlafzimmer.bettkaesten: "Bettkästen kontrollieren" → "Bettkästen kontrollieren und reinigen"
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-cleaning-labels.js [--dry-run]
 */

import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const dbUrl =
  process.env.DATABASE_URL ||
  "postgres://bookingbot:kr@ssesP@ssw0rt1stkr@ss@localhost:5432/bookingbot";

const LABEL_UPDATES = [
  { area: "kueche", task: "muelleimer", newLabel: "Mülleimer leeren und reinigen" },
  { area: "schlafzimmer", task: "schraenke", newLabel: "Schränke kontrollieren und reinigen" },
  { area: "schlafzimmer", task: "bettkaesten", newLabel: "Bettkästen kontrollieren und reinigen" },
];

const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const { rows } = await pool.query(
    "SELECT booking_id, cleaning_checklist FROM bookings WHERE cleaning_checklist IS NOT NULL"
  );

  console.log(`Found ${rows.length} bookings with cleaning checklists.`);
  let updated = 0;

  for (const row of rows) {
    const cl = row.cleaning_checklist;
    if (!cl?.areas) continue;

    let changed = false;

    for (const { area, task, newLabel } of LABEL_UPDATES) {
      const t = cl.areas?.[area]?.tasks?.[task];
      if (t && t.label !== newLabel) {
        console.log(
          `  Booking ${row.booking_id}: ${area}.${task} "${t.label}" → "${newLabel}"`
        );
        t.label = newLabel;
        changed = true;
      }
    }

    if (changed) {
      if (dryRun) {
        console.log(`  [DRY-RUN] Would update booking ${row.booking_id}`);
      } else {
        await pool.query(
          "UPDATE bookings SET cleaning_checklist = $1, updated_at = NOW() WHERE booking_id = $2",
          [JSON.stringify(cl), row.booking_id]
        );
        console.log(`  ✅ Updated booking ${row.booking_id}`);
      }
      updated++;
    }
  }

  console.log(
    `\nDone. ${updated} booking(s) ${dryRun ? "would be" : ""} updated.`
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
