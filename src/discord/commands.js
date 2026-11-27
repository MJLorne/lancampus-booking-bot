import { MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { syncBookingChannel } from "../services/bookingService.js";
import { noteTypeLabel } from "../services/bookingNotesService.js";
import { buildFullName } from "../utils/booking.js";

export async function registerSlashCommands(client) {
  const commands = [
    new SlashCommandBuilder()
      .setName("refresh")
      .setDescription("Aktualisiert Embed + Topic für die aktuelle Buchung")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
    new SlashCommandBuilder()
      .setName("bookings")
      .setDescription("Zeigt alle aktiven Buchungen sortiert nach Anreisedatum")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
    new SlashCommandBuilder()
      .setName("notiz")
      .setDescription("Hinterlegt eine Notiz in der LanCampus-Übersicht")
      .addStringOption((option) => option
        .setName("typ")
        .setDescription("Art der Notiz")
        .setRequired(true)
        .addChoices(
          { name: "Allgemeine Notiz", value: "allgemein" },
          { name: "Sonderwunsch", value: "sonderwunsch" },
          { name: "Schaden", value: "schaden" },
          { name: "Fundsache", value: "fundsache" }
        ))
      .addStringOption((option) => option
        .setName("text")
        .setDescription("Inhalt der Notiz")
        .setRequired(true)
        .setMaxLength(500)),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(client.token);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, config.guildId),
    { body: commands }
  );

  console.log("✅ Slash commands /refresh, /bookings und /notiz registriert");
}

export async function handleChatInputCommand(interaction, deps) {
  const { store, client } = deps;

  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === "notiz") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    let type;
    let updatedBooking;

    try {
      const booking = await store.getBookingByChannelId(channel?.id);

      if (!booking) {
        await interaction.editReply({ content: "❌ Für diesen Channel wurde keine Buchung gefunden." });
        return true;
      }

      type = interaction.options.getString("typ", true);
      const text = interaction.options.getString("text", true);
      const memberName = interaction.member?.displayName || interaction.user?.username || "Unbekannt";
      updatedBooking = await store.addBookingNote(booking.booking_id, {
        type,
        text,
        created_by: interaction.user?.id || null,
        created_by_name: memberName,
      });
      if (!updatedBooking) throw new Error("Buchung wurde beim Speichern nicht gefunden.");
    } catch (err) {
      console.error("note persistence failed:", err);
      await interaction.editReply({
        content: `❌ Notiz konnte nicht gespeichert werden: ${err?.message || "Unbekannter Fehler"}`,
      }).catch(() => {});
      return true;
    }

    try {
      const sync = deps.syncBookingChannelFn || syncBookingChannel;
      await sync({ channel, booking: updatedBooking, client, store, member: interaction.member });
      await interaction.editReply({ content: `✅ ${noteTypeLabel(type)} gespeichert und Übersicht aktualisiert.` });
    } catch (err) {
      console.error("note overview sync failed:", err);
      await interaction.editReply({
        content: `✅ ${noteTypeLabel(type)} wurde gespeichert. ⚠️ Die Übersicht konnte nicht aktualisiert werden; /refresh kann dies nachholen.`,
      }).catch(() => {});
    }
    return true;
  }

  if (interaction.commandName === "bookings") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const all = await store.loadBookings();
    const active = all
      .filter((b) => !b.archived)
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

    if (!active.length) {
      await interaction.editReply({ content: "📋 Keine aktiven Buchungen." });
      return true;
    }

    const lines = active.map((b) => {
      const name = buildFullName(b.lastname, b.firstname) || "—";
      const assignee = b.assignee?.display_name || "⚠️ kein Betreuer";
      const ch = b.channel_id ? `<#${b.channel_id}>` : "—";
      const status = b.cleaning_checklist?.meta?.completed ? "✅" : b.assignee?.user_id ? "🟢" : "🟡";
      return `${status} **${b.start_date}** – ${name} ${ch} _(${assignee})_`;
    });

    const header = `📋 **Aktive Buchungen (${active.length})**\n\n`;
    const chunks = [];
    let current = header;
    for (const line of lines) {
      if (current.length + line.length + 1 > 1900) {
        chunks.push(current);
        current = "";
      }
      current += line + "\n";
    }
    if (current) chunks.push(current);

    await interaction.editReply({ content: chunks[0] });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (interaction.commandName === "refresh") {
    const channel = interaction.channel;
    const booking = await store.getBookingByChannelId(channel?.id);

    if (!booking) {
      await interaction.reply({
        content: "❌ Für diesen Channel wurde keine Buchung gefunden.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await syncBookingChannel({ channel, booking, client, store, member: interaction.member });
      await interaction.editReply({ content: "✅ Buchungskanal wurde aktualisiert." });
    } catch (err) {
      console.error("refresh failed:", err);
      await interaction.editReply({
        content: `❌ /refresh fehlgeschlagen: ${err?.message || "Unbekannter Fehler"}`
      }).catch(() => {});
    }

    return true;
  }

  return false;
}
