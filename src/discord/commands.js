import { PermissionsBitField, REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { isAdmin, syncBookingChannel } from "../services/bookingService.js";

export async function registerCommands(client) {
  const refreshCmd = new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Admin: Aktualisiert die Buchungsübersicht/Embed in diesem Channel")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: [refreshCmd.toJSON()] });
  console.log("✅ Slash command /refresh registriert");
}

export async function handleChatInputCommand(interaction, deps) {
  const { client, store, audit } = deps;
  if (interaction.commandName !== "refresh") return false;
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: "❌ Nur Admins dürfen /refresh nutzen.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: "❌ Das geht nur in einem Text-Channel.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const booking = await store.getBookingByChannelId(channel.id);
  if (!booking) {
    await interaction.editReply("❌ Booking nicht in bookings.json gefunden.");
    return true;
  }

  const edited = await syncBookingChannel({ channel, booking, client, store });
  await audit.log(`🔄 /refresh: **${booking.booking_id}** in <#${channel.id}> von <@${interaction.user.id}> (${edited ? "embed aktualisiert" : "embed nicht gefunden"})`);
  await interaction.editReply(edited ? "✅ Aktualisiert (Embed + Topic)." : "⚠️ Topic aktualisiert, aber Buchungs-Embed nicht gefunden.");
  return true;
}
