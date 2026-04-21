export function createAuditService({ client, config }) {
  let cachedChannel = null;

  return {
    async log(message) {
      try {
        if (!config.auditChannelId) return;
        if (!cachedChannel?.isTextBased()) {
          const guild = await client.guilds.fetch(config.guildId);
          cachedChannel = await guild.channels.fetch(config.auditChannelId);
        }
        if (!cachedChannel?.isTextBased()) return;
        const ts = Math.floor(Date.now() / 1000);
        await cachedChannel.send(`<t:${ts}:f> ${message}`);
      } catch (err) {
        cachedChannel = null;
        console.error("audit log failed:", err?.message || err);
      }
    }
  };
}
