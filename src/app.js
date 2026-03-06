import { validateConfig, config } from "./config.js";
import * as store from "./storage/bookingStore.js";
import { createDiscordClient } from "./discord/client.js";
import { createAuditService } from "./services/auditService.js";
import { createArchiveService } from "./services/archiveService.js";
import { createReminderService } from "./services/reminderService.js";
import { registerCommands } from "./discord/commands.js";
import { registerInteractionHandlers } from "./discord/interactions.js";
import { createHttpApp } from "./http/routes.js";

validateConfig();

const client = createDiscordClient();
const audit = createAuditService({ client, config });
const archiveService = createArchiveService({ client, store, audit });
const reminderService = createReminderService({ client, store, audit });

const deps = { client, config, store, audit, archiveService, reminderService };
registerInteractionHandlers(client, deps);

function startLoops() {
  setTimeout(() => {
    reminderService.runReminderSweep();
    archiveService.runArchiveSweep();
  }, 10_000);

  setInterval(() => reminderService.runReminderSweep(), config.reminderCheckMinutes * 60 * 1000);
  setInterval(() => archiveService.runArchiveSweep(), config.sweepMinutes * 60 * 1000);

  console.log(`⏱️ Loops: reminders every ${config.reminderCheckMinutes}m days=[${reminderService.parseReminderDays().join(",")}], archive every ${config.sweepMinutes}m after=${config.archiveAfterDays}d (${config.tz})`);
}

client.once("clientReady", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  try {
    await registerCommands(client);
  } catch (e) {
    console.error("❌ registerCommands failed:", e);
  }
  startLoops();
});

const app = createHttpApp(deps);
app.listen(config.port, "0.0.0.0", () => {
  console.log(`🌐 HTTP listening on :${config.port}`);
});

client.login(config.discordToken);
