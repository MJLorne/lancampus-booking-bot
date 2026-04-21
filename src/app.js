import { validateConfig, config } from "./config.js";
import { getStore } from "./storage/index.js";
import { createDiscordClient } from "./discord/client.js";
import { createAuditService } from "./services/auditService.js";
import { createArchiveService } from "./services/archiveService.js";
import { createReminderService } from "./services/reminderService.js";
import { registerSlashCommands } from "./discord/commands.js";
import { registerInteractionHandlers } from "./discord/interactions.js";
import { createHttpApp } from "./http/routes.js";

validateConfig();
const store = getStore();

const client = createDiscordClient();
const audit = createAuditService({ client, config });
const archiveService = createArchiveService({ client, store, audit });
const reminderService = createReminderService({ client, store, audit });

const deps = { client, config, store, audit, archiveService, reminderService };
registerInteractionHandlers(client, deps);

async function waitForStore(retries = 10, delayMs = 5_000) {
  for (let i = 0; i < retries; i++) {
    try {
      await store.loadBookings();
      return;
    } catch (e) {
      console.warn(`⏳ Storage nicht erreichbar, Versuch ${i + 1}/${retries}: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Storage nach mehreren Versuchen nicht erreichbar – Loops werden nicht gestartet.");
}

function startLoops() {
  waitForStore().then(() => {
    reminderService.runReminderSweep();
    archiveService.runArchiveSweep();

    setInterval(() => reminderService.runReminderSweep(), config.reminderCheckMinutes * 60 * 1000);
    setInterval(() => archiveService.runArchiveSweep(), config.sweepMinutes * 60 * 1000);

    console.log(`⏱️ Loops: reminders every ${config.reminderCheckMinutes}m days=[${reminderService.parseReminderDays().join(",")}], archive every ${config.sweepMinutes}m after=${config.archiveAfterDays}d (${config.tz})`);
  }).catch((e) => console.error("❌ startLoops aborted:", e?.message || e));
}

client.once("clientReady", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  try {
    await registerSlashCommands(client);
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

async function shutdown() {
  console.log("🛑 Shutting down...");
  client.destroy();
  await store.closeStore?.().catch(() => {});
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
