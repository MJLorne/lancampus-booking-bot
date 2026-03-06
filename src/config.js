import path from "path";

const env = process.env;

export const config = {
  discordToken: env.DISCORD_TOKEN,
  guildId: env.GUILD_ID,
  internalCategoryId: env.INTERNAL_CATEGORY_ID,
  wpSharedSecret: env.WP_SHARED_SECRET,
  port: Number(env.PORT || 3000),
  tz: env.TZ || "Europe/Berlin",

  adminRoleName: env.ADMIN_ROLE_NAME || "Admin",
  assigneeManagerRoleName: env.ASSIGNEE_MANAGER_ROLE_NAME || "LanCampus-Staff",
  auditChannelId: env.AUDIT_CHANNEL_ID || "",

  reminderDays: env.REMINDER_DAYS || "7,1",
  reminderCheckMinutes: Math.max(5, Number(env.REMINDER_CHECK_MINUTES) || 60),

  archiveAfterDays: Math.max(0, Number(env.ARCHIVE_AFTER_DAYS) || 7),
  archiveCategoryId: env.ARCHIVE_CATEGORY_ID || "",
  archiveLockChannel: String(env.ARCHIVE_LOCK_CHANNEL || "true").toLowerCase() === "true",
  sweepMinutes: Math.max(5, Number(env.SWEEP_MINUTES) || 60),

  dataDir: env.DATA_DIR || "/data",
  smallAreaTasksMax: 5,
};

export const bookingsFile = path.join(config.dataDir, "bookings.json");

export function validateConfig() {
  const missing = ["DISCORD_TOKEN", "GUILD_ID", "INTERNAL_CATEGORY_ID", "WP_SHARED_SECRET"]
    .filter((key) => !env[key]);

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}
