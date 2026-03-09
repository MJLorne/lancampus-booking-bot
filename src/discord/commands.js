import { MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { syncBookingChannel } from "../services/bookingService.js";

export async function registerSlashCommands(client) {
  const commands = [
    new SlashCommandBuilder()
      .setName("refresh")
      .setDescription("Aktualisiert Embed + Topic für die aktuelle Buchung")
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
