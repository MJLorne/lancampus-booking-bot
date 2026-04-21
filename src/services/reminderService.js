import { config } from "../config.js";
import { getBerlinYMD, parseYmdStringToUtcMs, ymdToUtcMs } from "../utils/date.js";

function parseReminderDays() {
  return Array.from(new Set(String(config.reminderDays)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0))).sort((a, b) => b - a);
}

export function createReminderService({ client, store, audit }) {
  return {
    parseReminderDays,
    async runReminderSweep() {
      try {
        if (!client.isReady()) return;
        const daysList = parseReminderDays();
        if (!daysList.length) return;
        const bookings = await store.loadBookings();
        const todayUtcMs = ymdToUtcMs(getBerlinYMD(config.tz));

        const warnThresholdDays = daysList.length ? Math.max(...daysList) : 7;

        for (const booking of bookings) {
          if (!booking?.start_date || !booking?.channel_id || booking.archived) continue;
          const startUtcMs = parseYmdStringToUtcMs(booking.start_date);
          if (startUtcMs == null) continue;
          if (startUtcMs < todayUtcMs) continue;
          const remindersSent = booking.reminders_sent || {};

          if (!booking.assignee?.user_id) {
            const warnUtcMs = startUtcMs - warnThresholdDays * 24 * 60 * 60 * 1000;
            if (warnUtcMs <= todayUtcMs && !remindersSent["no_assignee_warning"]) {
              const channel = await client.channels.fetch(booking.channel_id).catch(() => null);
              if (channel?.isTextBased()) {
                await channel.send(`⚠️ **Kein Betreuer gesetzt!** Anreise am **${booking.start_date}** – bitte Betreuer zuweisen.`);
                await store.markReminderSent(booking.booking_id, "no_assignee_warning");
                await audit.log(`⚠️ Kein Betreuer: **${booking.booking_id}** – Anreise ${booking.start_date} in <#${booking.channel_id}>`);
              }
            }
            continue;
          }

          for (const daysBefore of daysList) {
            const reminderUtcMs = startUtcMs - daysBefore * 24 * 60 * 60 * 1000;
            if (reminderUtcMs > todayUtcMs) continue;
            if (remindersSent[String(daysBefore)]) continue;

            const channel = await client.channels.fetch(booking.channel_id).catch(() => null);
            if (!channel?.isTextBased()) continue;

            await channel.send(`⏰ **Reminder (${daysBefore} Tag${daysBefore === 1 ? "" : "e"} vorher)**: Anreise am **${booking.start_date}**. Betreuer: <@${booking.assignee.user_id}>`);
            await store.markReminderSent(booking.booking_id, daysBefore);
            await audit.log(`⏰ Reminder gesendet: **${booking.booking_id}** (${daysBefore}d) in <#${booking.channel_id}>`);
          }
        }
      } catch (e) {
        console.error("reminder sweep error:", e);
      }
    }
  };
}
