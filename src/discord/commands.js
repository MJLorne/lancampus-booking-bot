import { MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { syncBookingChannel } from "../services/bookingService.js";
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
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(client.token);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, config.guildId),
    { body: commands }
  );

  console.log("✅ Slash command /refresh registriert");
}

export async function handleChatInputCommand(interaction, deps) {
  const { store, client } = deps;

  if (!interaction.isChatInputCommand()) return false;

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
