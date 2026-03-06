import { config } from "../config.js";
import { reactivateButtonRow } from "../discord/renderers.js";
import { getBerlinYMD, parseYmdStringToUtcMs, ymdToUtcMs } from "../utils/date.js";
import { canArchiveBooking } from "./cleaningService.js";
import { syncOverviewMessage } from "./bookingService.js";

export function createArchiveService({ client, store, audit }) {
  return {
    async archiveChannelNow({ channel, booking, reason, actorUserId }) {
      if (config.archiveCategoryId) {
        try {
          await channel.setParent(config.archiveCategoryId, { lockPermissions: false });
        } catch (e) {
          console.error("setParent failed:", e);
          await audit.log(`❌ setParent fehlgeschlagen in <#${channel.id}> → ARCHIVE_CATEGORY_ID=${config.archiveCategoryId}. Fehler: ${e?.message || e}`);
        }
      }

      if (config.archiveLockChannel) {
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      }

      if (!channel.name.startsWith("📦-")) {
        await channel.setName(`📦-${channel.name}`.slice(0, 100)).catch(() => {});
      }

      const ctrlMsg = await channel.send({
        content: "📦 **Diese Buchung ist archiviert.**\nAdmins können sie über den Button reaktivieren.",
        components: [reactivateButtonRow()],
      }).catch(() => null);
      if (ctrlMsg) await ctrlMsg.pin().catch(() => {});

      const who = actorUserId ? ` von <@${actorUserId}>` : "";
      await channel.send(`📦 Archiviert${who}. ${reason ? `Grund: **${reason}**.` : ""}`).catch(() => {});

      if (booking?.booking_id) {
        const updatedBooking = await store.updateBooking(booking.booking_id, {
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: reason || null,
        });
        await syncOverviewMessage({ channel, booking: updatedBooking, client, store });
      }

      await audit.log(`📦 Archiviert: **${booking?.booking_id || "?"}** → <#${channel.id}> (${reason || "—"})`);
    },

    async runArchiveSweep() {
      try {
        if (!client.isReady()) return;
        const todayUtcMs = ymdToUtcMs(getBerlinYMD(config.tz));
        const bookings = await store.loadBookings();

        for (const booking of bookings) {
          if (!booking?.end_date || !booking?.channel_id || booking.archived) continue;
          const endUtcMs = parseYmdStringToUtcMs(booking.end_date);
          if (endUtcMs == null) continue;
          const archiveAtUtcMs = endUtcMs + config.archiveAfterDays * 24 * 60 * 60 * 1000;
          if (todayUtcMs < archiveAtUtcMs) continue;

          const channel = await client.channels.fetch(booking.channel_id).catch(() => null);
          if (!channel?.isTextBased()) {
            await store.updateBooking(booking.booking_id, {
              archived: true,
              archived_at: new Date().toISOString(),
              archived_reason: "channel missing",
            });
            continue;
          }

          if (!canArchiveBooking(booking)) {
            await audit.log(`⏸️ Auto-Archiv übersprungen: **${booking.booking_id}** – Endreinigung noch nicht abgeschlossen.`);
            continue;
          }

          await this.archiveChannelNow({
            channel,
            booking,
            reason: `Auto-Archiv (Abreise ${booking.end_date} + ${config.archiveAfterDays} Tage)`,
            actorUserId: null,
          });
        }
      } catch (e) {
        console.error("archive sweep error:", e);
      }
    },
  };
}
