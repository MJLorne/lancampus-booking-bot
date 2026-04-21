export function createAuditService({ client, config }) {
  return {
    async log(message) {
      try {
        if (!config.auditChannelId) return;
        const guild = await client.guilds.fetch(config.guildId);
        const channel = await guild.channels.fetch(config.auditChannelId);
        if (!channel?.isTextBased()) return;
        const ts = Math.floor(Date.now() / 1000);
        await channel.send(`<t:${ts}:f> ${message}`);
      } catch (err) {
        console.error("audit log failed:", err?.message || err);
      }
    }
  };
}
