import { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from "discord.js";
import { normalizeDateToYMD, buildFullName, buildZeitraum } from "../utils/booking.js";
import { canArchiveBooking } from "../services/cleaningService.js";

export function buildChannelTopic(booking) {
  const parts = [];
  parts.push(buildZeitraum({
    start_date: normalizeDateToYMD(booking?.start_date),
    end_date: normalizeDateToYMD(booking?.end_date),
    start_time: booking?.start_time,
    end_time: booking?.end_time,
  }));

  const fullName = buildFullName(booking?.lastname, booking?.firstname);
  if (fullName) parts.push(fullName);
  if (booking?.club_name) parts.push(`Verein: ${booking.club_name}`);
  if (booking?.assignee?.display_name) parts.push(`Betreuer: ${booking.assignee.display_name}`);
  if (booking?.cleaning_checklist?.meta?.completed) parts.push("Reinigung: abgeschlossen ✅");

  return parts.join(" | ").slice(0, 1024);
}

export function getAssigneeFromTopic(topic) {
  const m = (topic || "").match(/Betreuer:\s*([^|]+)\s*(\||$)/i);
  return m ? m[1].trim() : null;
}

export function buildBookingEmbed(booking) {
  const fullName = buildFullName(booking?.lastname, booking?.firstname);
  const zeitraum = buildZeitraum({
    start_date: normalizeDateToYMD(booking?.start_date),
    end_date: normalizeDateToYMD(booking?.end_date),
    start_time: booking?.start_time,
    end_time: booking?.end_time,
  });

  return {
    title: "Buchungsdetails",
    fields: [
      { name: "Name, Vorname", value: fullName || "—", inline: true },
      { name: "Verein", value: booking?.club_name ? String(booking.club_name) : "—", inline: true },
      { name: "Buchungsdatum", value: booking?.booking_date || "—", inline: true },
      { name: "Booking-ID", value: String(booking?.booking_id || "—"), inline: true },
      { name: "Buchungszeitraum", value: zeitraum, inline: false },
      { name: "Personen", value: booking?.persons ? String(booking.persons) : "—", inline: true },
      { name: "Wäschepaket", value: booking?.laundry_package ? String(booking.laundry_package) : "—", inline: true },
      { name: "Betreuer", value: booking?.assignee?.display_name || "—", inline: true },
      { name: "Reinigung", value: booking?.cleaning_checklist?.meta?.completed ? "Abgeschlossen ✅" : "Offen", inline: true },
      { name: "Archivstatus", value: booking?.archived ? "Archiviert 📦" : "Aktiv", inline: true },
    ],
  };
}

export function buildBookingActionRows(booking) {

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("assign_booking")
      .setLabel(booking?.assignee?.user_id ? "Bereits betreut" : "Ich betreue diese Buchung")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!!booking?.assignee?.user_id || !!booking?.archived),

    new ButtonBuilder()
      .setCustomId("archive_now")
      .setLabel("Archivieren jetzt")
      .setEmoji("📦")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!!booking?.archived || !canArchiveBooking(booking))
  );

  const row2 = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("select_assignee")
      .setPlaceholder("Betreuer auswählen")
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(!!booking?.archived)
  );

  return [row1, row2];
}

export function reactivateButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("reactivate_booking").setLabel("Reaktivieren").setEmoji("🔓").setStyle(ButtonStyle.Success)
  );
}
