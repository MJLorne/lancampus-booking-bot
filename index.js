import express from "express";
import fs from "fs/promises";
import path from "path";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

/* ================== ENV ================== */
const {
  DISCORD_TOKEN,
  GUILD_ID,
  INTERNAL_CATEGORY_ID,
  WP_SHARED_SECRET,
  PORT = "3000",
  TZ = "Europe/Berlin",

  ADMIN_ROLE_NAME = "Admin",

  // Optional: Audit Log Channel (Text-Channel ID)
  AUDIT_CHANNEL_ID = "",

  // Reminder (nur wenn Betreuer gesetzt)
  REMINDER_DAYS = "7,1",
  REMINDER_CHECK_MINUTES = "60",

  // Auto-Archiv
  ARCHIVE_AFTER_DAYS = "7",
  ARCHIVE_CATEGORY_ID = "",       // optional: Archiv-Kategorie ID
  ARCHIVE_LOCK_CHANNEL = "true",  // true/false
  SWEEP_MINUTES = "60",

  // Persistenz
  DATA_DIR = "/code/data"
} = process.env;

for (const k of ["DISCORD_TOKEN", "GUILD_ID", "INTERNAL_CATEGORY_ID", "WP_SHARED_SECRET"]) {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

/* ================== DISCORD CLIENT ================== */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================== HTTP APP ================== */
const app = express();
app.use(express.json({ limit: "1mb" }));

/* ================== STORAGE ================== */
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const SMALL_AREA_TASKS_MAX = 5; // <=5 Buttons, sonst Dropdown

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function registerCommands() {
  const refreshCmd = new SlashCommandBuilder()
	  .setName("refresh")
	  .setDescription("Admin: Aktualisiert die Buchungsübersicht/Embed in diesem Channel")
	  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: [refreshCmd.toJSON()] }
  );

  console.log("✅ Slash command /refresh registriert");
}

async function loadBookings() {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveBookings(bookings) {
  await ensureDataDir();
  const tmp = `${BOOKINGS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(bookings, null, 2), "utf8");
  await fs.rename(tmp, BOOKINGS_FILE);
}

async function getBooking(booking_id) {
  const bookings = await loadBookings();
  return bookings.find((b) => String(b.booking_id) === String(booking_id)) || null;
}

async function upsertBooking(entry) {
	

  const bookings = await loadBookings();
  const idx = bookings.findIndex((b) => String(b.booking_id) === String(entry.booking_id));
  const now = new Date().toISOString();

  const merged = {
    ...(idx >= 0 ? bookings[idx] : {}),
    ...entry,
    updated_at: now,
    created_at: idx >= 0 ? bookings[idx].created_at : now,
    reminders_sent: idx >= 0 ? (bookings[idx].reminders_sent || {}) : (entry.reminders_sent || {}),
    archived: idx >= 0 ? (bookings[idx].archived ?? entry.archived ?? false) : (entry.archived ?? false),
	cleaning_checklist: idx >= 0 ? (bookings[idx].cleaning_checklist || entry.cleaning_checklist) : entry.cleaning_checklist,
  };

  if (idx >= 0) bookings[idx] = merged;
  else bookings.push(merged);

  await saveBookings(bookings);
  return merged;
}

async function updateBooking(booking_id, patch) {
  const bookings = await loadBookings();
  const idx = bookings.findIndex((b) => String(b.booking_id) === String(booking_id));
  if (idx < 0) return null;
  bookings[idx] = { ...bookings[idx], ...patch, updated_at: new Date().toISOString() };
  await saveBookings(bookings);
  return bookings[idx];
}

async function markReminderSent(booking_id, daysBefore) {
  const bookings = await loadBookings();
  const idx = bookings.findIndex((b) => String(b.booking_id) === String(booking_id));
  if (idx < 0) return;

  const reminders = { ...(bookings[idx].reminders_sent || {}) };
  reminders[String(daysBefore)] = new Date().toISOString();

  bookings[idx] = { ...bookings[idx], reminders_sent: reminders, updated_at: new Date().toISOString() };
  await saveBookings(bookings);
}

/* ================== HELPERS ================== */
function slugify(text, maxLen = 30) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

function normalizeDateToYMD(input) {
  if (!input) return "unknown-date";
  const s = String(input).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD.MM.YYYY
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // DD-MM-YYYY
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  return "unknown-date";
}

function buildZeitraum({ start_date, end_date, start_time, end_time }) {
  if (start_time || end_time) {
    return `${start_date || "?"} ${start_time || "?"} → ${end_date || "?"} ${end_time || "?"}`;
  }
  return `${start_date || "?"} → ${end_date || "?"}`;
}

function getAssigneeFromTopic(topic) {
  const m = (topic || "").match(/Betreuer:\s*([^|]+)\s*(\||$)/i);
  return m ? m[1].trim() : null;
}

function setAssigneeInTopic(topic, assignee) {
  const base = (topic || "").replace(/\s*\|\s*Betreuer:\s*[^|]+/i, "").trim();
  const next = `${base}${base ? " | " : ""}Betreuer: ${assignee}`;
  return next.slice(0, 1024);
}

function isAdmin(member) {
  return member?.roles?.cache?.some((r) => r.name === ADMIN_ROLE_NAME) ?? false;
}

function extractBookingIdFromChannelName(channelName) {
  // Format: (optional) 📦-YYYY-MM-DD-<id>-...
  const m = String(channelName || "").match(
    /^(?:📦-)?(?:\d{4}-\d{2}-\d{2}|unknown-date)-([^-]+)/i
  );
  return m?.[1] || null;
}

async function pinSingleAssignee(channel, assignee, setterUserId) {
  const pins = await channel.messages.fetchPinned();
  for (const [, msg] of pins) {
    if (msg.author?.id === client.user?.id && msg.content?.startsWith("📌 **Betreuer:**")) {
      await msg.unpin().catch(() => {});
    }
  }
  const msg = await channel.send(`📌 **Betreuer:** ${assignee}\n(gesetzt von <@${setterUserId}>)`);
  await msg.pin().catch(() => {});
}

/* ================== CLEANING OVERVIEW ================== */
function cleaningAreaSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("cleaning_select_area")
    .setPlaceholder("Bereich auswählen …")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Gaming").setValue("gaming").setEmoji("🖥️"),
      new StringSelectMenuOptionBuilder().setLabel("Badezimmer").setValue("badezimmer").setEmoji("🚿"),
      new StringSelectMenuOptionBuilder().setLabel("Gäste-WC").setValue("gaeste_wc").setEmoji("🚽"),
      new StringSelectMenuOptionBuilder().setLabel("Wohnzimmer").setValue("wohnzimmer").setEmoji("🛋️"),
      new StringSelectMenuOptionBuilder().setLabel("Küche").setValue("kueche").setEmoji("🍽️"),
      new StringSelectMenuOptionBuilder().setLabel("Schlafzimmer").setValue("schlafzimmer").setEmoji("🛏️"),
      new StringSelectMenuOptionBuilder().setLabel("Außenbereich").setValue("aussen").setEmoji("🌿"),
      new StringSelectMenuOptionBuilder().setLabel("Sonstiges").setValue("sonstiges").setEmoji("🧹")
    );

  return new ActionRowBuilder().addComponents(menu);
}

async function ensureCleaningSelectMessage(channel, booking_id) {
  const b = await getBooking(booking_id);

  if (b?.cleaning_select_message_id) {
    const msg = await channel.messages.fetch(b.cleaning_select_message_id).catch(() => null);
    if (msg) {
      await msg.edit({ content: "🧼 **Reinigung** – Bereich auswählen:", components: [cleaningAreaSelectRow()] }).catch(() => {});
      return msg;
    }
  }
  const msg = await channel.send({
    content: "🧼 **Reinigung** – Bereich auswählen:",
    components: [cleaningAreaSelectRow()]
  });

  await updateBooking(booking_id, { cleaning_select_message_id: msg.id });
  return msg;
}

async function upsertCleaningDetailMessage(channel, booking_id, areaKey) {
  const b = await getBooking(booking_id);
  const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());
  const area = cleaning.areas?.[areaKey];
  if (!area) return null;

  const content = renderAreaDetailText(area);
  const components = buildTaskControls(areaKey, area);

  // Wenn existiert -> edit
  if (b?.cleaning_detail_message_id) {
    const msg = await channel.messages.fetch(b.cleaning_detail_message_id).catch(() => null);
    if (msg) {
      await msg.edit({ content, components }).catch(() => {});
      await updateBooking(booking_id, { cleaning_checklist: cleaning });
      return msg;
    }
  }

  // sonst neu
  const msg = await channel.send({ content, components });
  await updateBooking(booking_id, { cleaning_checklist: cleaning, cleaning_detail_message_id: msg.id });
  return msg;
}

async function auditLog(message) {
  try {
    const auditId = process.env.AUDIT_CHANNEL_ID;
    if (!auditId) return;

    const guild = await client.guilds.fetch(GUILD_ID);
    const ch = await guild.channels.fetch(auditId);
    if (!ch || !ch.isTextBased()) return;

    await ch.send(message);
  } catch (err) {
    console.error("auditLog failed:", err?.message || err);
  }
}

function defaultCleaningChecklist() {
  return {
    version: 1,
    meta: { completed: false, completed_at: null, completed_by: null },
    areas: {
      gaming: { label: "Gaming", icon: "🖥️", completed: false, tasks: {} },
      badezimmer: { label: "Badezimmer", icon: "🚿", completed: false, tasks: {} },
      gaeste_wc: { label: "Gäste-WC", icon: "🚽", completed: false, tasks: {} },
      wohnzimmer: { label: "Wohnzimmer", icon: "🛋️", completed: false, tasks: {} },
      kueche: { label: "Küche", icon: "🍽️", completed: false, tasks: {} },
      schlafzimmer: { label: "Schlafzimmer", icon: "🛏️", completed: false, tasks: {} },
      aussen: { label: "Außenbereich", icon: "🌿", completed: false, tasks: {} },
      sonstiges: { label: "Sonstiges", icon: "🧹", completed: false, tasks: {} }
    }
  };
}

function ensureTasksInChecklist(cleaning) {
  // Falls Tasks noch nicht drin sind (oder später erweitert werden)
  const template = {
    gaming: [
      ["plaetze", "Plätze aufräumen und putzen"],
      ["monitor", "Monitor mit Glasreiniger reinigen"],
      ["peripherie", "Maus/Tastatur/Headset reinigen"],
      ["tisch", "Tischplatte reinigen"],
      ["monitore", "Monitore einstellen"],
      ["stuehle", "Stühle gerade rücken"],
      ["teppiche", "Teppiche staubsaugen"]
    ],
    badezimmer: [
      ["handtuecher_sammeln", "Handtücher einsammeln"],
      ["handtuecher_waschen", "Handtücher waschen"],
      ["dusche", "Dusche reinigen"],
      ["muelleimer", "Mülleimer leeren"],
      ["toilette", "Toilette putzen"],
      ["waschbecken", "Waschbecken putzen"],
      ["wischen", "Wischen"]
    ],
    gaeste_wc: [
      ["muelleimer", "Mülleimer leeren"],
      ["toilette", "Toilette putzen"],
      ["waschbecken", "Waschbecken putzen"],
      ["staubsaugen", "Staubsaugen"],
      ["wischen", "Wischen"]
    ],
    wohnzimmer: [
      ["sofa", "Sofa gerade rücken"],
      ["kissen", "Kissen aufschütteln"],
      ["tische", "Tische abputzen"],
      ["staubsaugen", "Staubsaugen"],
      ["wischen", "Wischen"],
      ["tv", "ggf. TV abwischen (wenn fettige Finger)"]
    ],
    kueche: [
      ["spuelmaschine", "Spülmaschine leeren"],
      ["aufraeumen", "Aufräumen"],
      ["geschirr", "Geschirr auf Sauberkeit prüfen"],
      ["putzen", "Küche putzen"],
      ["kuehlschrank", "Kühlschrank auswischen"],
      ["wasserkocher", "Wasserkocher reinigen"],
      ["eierkocher", "Eierkocher reinigen"],
      ["kaffee", "Kaffeemaschine reinigen"],
      ["muelleimer", "Mülleimer leeren"],
      ["staubsaugen", "Staubsaugen"],
      ["wischen", "Wischen"]
    ],
    schlafzimmer: [
      ["betten", "Betten abziehen"],
      ["bettwaesche", "Bettwäsche waschen"],
      ["schraenke", "Schränke kontrollieren"],
      ["bettkaesten", "Bettkästen kontrollieren"],
      ["staubsaugen", "Staubsaugen"],
      ["bilder", "Bilder gerade rücken"],
      ["wischen", "Wischen"]
    ],
    aussen: [
      ["grill", "Grill reinigen"],
      ["moebel", "Möbel abputzen"],
      ["sitzkissen", "Sitzkissen rauslegen"],
      ["fegen", "Fegen"]
    ],
    sonstiges: [
      ["treppe", "Treppengeländer Staubwischen"],
      ["sockelleisten", "Sockelleisten Staubwischen"]
    ]
  };

  for (const [areaKey, entries] of Object.entries(template)) {
    const area = cleaning.areas?.[areaKey];
    if (!area) continue;
    area.tasks ??= {};

    for (const [taskKey, label] of entries) {
      area.tasks[taskKey] ??= { label, done: false, done_by: null, done_at: null };
    }
  }
  return cleaning;
}

function allAreasCompleted(cleaning) {
  const areas = cleaning?.areas || {};
  return Object.values(areas).length > 0 && Object.values(areas).every((a) => a.completed);
}

function isCleaningCompleted(cleaning) {
  return !!cleaning?.meta?.completed;
}

function cleaningFinishRow(cleaning) {
  const canFinish = allAreasCompleted(cleaning) && !isCleaningCompleted(cleaning);

  const btn = new ButtonBuilder()
    .setCustomId("cleaning_finish")
    .setLabel(isCleaningCompleted(cleaning) ? "Endreinigung abgeschlossen" : "Endreinigung abschließen")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!canFinish);

  return new ActionRowBuilder().addComponents(btn);
}

function renderCleaningOverviewText(cleaning) {
  const areas = cleaning?.areas || {};
  const lines = Object.entries(areas).map(([_, a]) => {
    const box = a.completed ? "🟢" : "⬜";
    return `${box} ${a.icon || "•"} ${a.label}`;
  });

  return `🧹 **Reinigung – Übersicht**\n${lines.join("\n")}\n\n_Öffne später einen Bereich, um die Detailpunkte abzuhaken._`;
}

function renderAreaDetailText(area) {
  const tasks = area?.tasks || {};
  const lines = Object.entries(tasks).map(([_, t]) => {
    const mark = t.done ? "✅" : "⬜";
    const by = t.done && t.done_by ? ` _(von ${t.done_by})_` : "";
    return `${mark} ${t.label}${by}`;
  });

  return `${area.icon || "🧹"} **Reinigung – ${area.label}**\n\n${lines.join("\n")}`;
}

function buildTaskControls(areaKey, area) {
  const tasks = area?.tasks || {};
  const entries = Object.entries(tasks); // [taskKey, taskObj]

  // Kleine Bereiche: Buttons (max 5 pro row, Discord Limit)
  if (entries.length <= SMALL_AREA_TASKS_MAX) {
    const row = new ActionRowBuilder().addComponents(
      ...entries.slice(0, 5).map(([taskKey, task]) =>
        new ButtonBuilder()
          .setCustomId(`cleaning_toggle:${areaKey}:${taskKey}`)
          .setLabel(task.label.slice(0, 80))
          .setStyle(task.done ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    );

    // Optional: "Alles erledigt" Button als zweite Row, wenn du willst
    return [row];
  }

  // Große Bereiche: Dropdown (Task auswählen) + Toggle Button
  const select = new StringSelectMenuBuilder()
    .setCustomId(`cleaning_pick_task:${areaKey}`)
    .setPlaceholder("Aufgabe auswählen …")
    .addOptions(
      entries.slice(0, 25).map(([taskKey, task]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(task.label.slice(0, 100))
          .setValue(taskKey)
          .setEmoji(task.done ? "✅" : "⬜")
      )
    );

  const row1 = new ActionRowBuilder().addComponents(select);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cleaning_toggle_picked:${areaKey}`)
      .setLabel("Aufgabe umschalten")
      .setStyle(ButtonStyle.Primary)
  );

  return [row1, row2];
}


/**
 * Erstellt/aktualisiert die angepinnte Übersichts-Nachricht
 */
async function ensureCleaningOverviewPinned(channel, booking_id) {
  const b = await getBooking(booking_id);
  const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());
  const text = renderCleaningOverviewText(cleaning);
  const components = [cleaningFinishRow(cleaning)];

  // Wenn wir schon eine Message-ID gespeichert haben -> editieren
  if (b?.cleaning_overview_message_id) {
    const msg = await channel.messages.fetch(b.cleaning_overview_message_id).catch(() => null);
    if (msg) {
      await msg.edit({ content: text, components }).catch(() => {});
      const pins = await channel.messages.fetchPinned();
      if (![...pins.values()].some((m) => m.id === msg.id)) await msg.pin().catch(() => {});
      return msg;
    }
  }

  // sonst neu erstellen + pinnen + speichern
  const msg = await channel.send({ content: text, components });
  await msg.pin().catch(() => {});
  await updateBooking(booking_id, {
    cleaning_checklist: cleaning,
    cleaning_overview_message_id: msg.id
  });
  return msg;
}

/* ================== ARCHIVE / REACTIVATE UI ================== */
function reactivateButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("reactivate_booking")
      .setLabel("Reaktivieren")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success)
  );
}

/* ================== DATE HELPERS (Berlin) ================== */
function getBerlinYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ || "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return { y, m, d };
}

function ymdToUtcMs({ y, m, d }) {
  return Date.UTC(y, m - 1, d);
}

function parseYmdStringToUtcMs(yyyyMmDd) {
  const parts = String(yyyyMmDd || "").split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return Date.UTC(y, mo - 1, d);
}

/* ================== REMINDERS ================== */
function parseReminderDays() {
  const days = String(REMINDER_DAYS)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return Array.from(new Set(days)).sort((a, b) => b - a);
}

async function runReminderSweep() {
  try {
    if (!client.isReady()) return;

    const daysList = parseReminderDays();
    if (!daysList.length) return;

    const bookings = await loadBookings();
    if (!bookings.length) return;

    const todayUtcMs = ymdToUtcMs(getBerlinYMD());

    for (const b of bookings) {
      // nur wenn Betreuer gesetzt
      if (!b?.assignee?.user_id) continue;
      if (!b?.start_date || !b?.channel_id) continue;
      if (b.archived) continue;

      const startUtcMs = parseYmdStringToUtcMs(b.start_date);
      if (startUtcMs == null) continue;

      const remindersSent = b.reminders_sent || {};

      for (const daysBefore of daysList) {
        const reminderUtcMs = startUtcMs - daysBefore * 24 * 60 * 60 * 1000;
        if (reminderUtcMs !== todayUtcMs) continue;
        if (remindersSent[String(daysBefore)]) continue;

        const ch = await client.channels.fetch(b.channel_id).catch(() => null);
        if (!ch || !ch.isTextBased()) continue;

        await ch.send(
          `⏰ **Reminder (${daysBefore} Tag${daysBefore === 1 ? "" : "e"} vorher)**: Anreise am **${b.start_date}**. Betreuer: <@${b.assignee.user_id}>`
        );

        await markReminderSent(b.booking_id, daysBefore);
        await auditLog(`⏰ Reminder gesendet: **${b.booking_id}** (${daysBefore}d) in <#${b.channel_id}>`);
      }
    }
  } catch (e) {
    console.error("reminder sweep error:", e);
  }
}

/* ================== ARCHIVE ================== */
async function archiveChannelNow({ channel, booking, reason, actorUserId }) {
  const afterDays = Number(ARCHIVE_AFTER_DAYS);

  // verschieben
  if (ARCHIVE_CATEGORY_ID) {
    try {
	  await channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });
	} catch (e) {
	  console.error("setParent failed:", e);
	  await auditLog(`❌ setParent fehlgeschlagen in <#${channel.id}> → ARCHIVE_CATEGORY_ID=${ARCHIVE_CATEGORY_ID}. Fehler: ${e?.message || e}`);
	}
  }

  // lock (sendmessages auf false)
  if (String(ARCHIVE_LOCK_CHANNEL).toLowerCase() === "true") {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false }).catch(() => {});
  }

  // 📦 Prefix im Namen
  if (!channel.name.startsWith("📦-")) {
    await channel.setName(`📦-${channel.name}`.slice(0, 100)).catch(() => {});
  }

  // Info + Reaktivieren-Pin
  const ctrlMsg = await channel
    .send({
      content: "📦 **Diese Buchung ist archiviert.**\nAdmins können sie über den Button reaktivieren.",
      components: [reactivateButtonRow()]
    })
    .catch(() => null);

  if (ctrlMsg) await ctrlMsg.pin().catch(() => {});

  // Abschlussnachricht
  const who = actorUserId ? ` von <@${actorUserId}>` : "";
  await channel
    .send(`📦 Archiviert${who}. ${reason ? `Grund: **${reason}**.` : ""}`)
    .catch(() => {});

  // DB update
  if (booking?.booking_id) {
    await updateBooking(booking.booking_id, {
      archived: true,
      archived_at: new Date().toISOString(),
      archived_reason: reason || null
    });
  }

  await auditLog(`📦 Archiviert: **${booking?.booking_id || "?"}** → <#${channel.id}> (${reason || "—"})`);
}
async function runArchiveSweep() {
  try {
    if (!client.isReady()) return;

    const afterDays = Number(ARCHIVE_AFTER_DAYS);
    if (!Number.isFinite(afterDays) || afterDays < 0) return;

    const todayUtcMs = ymdToUtcMs(getBerlinYMD());
    const bookings = await loadBookings();

    for (const b of bookings) {
      if (!b?.end_date || !b?.channel_id) continue;
      if (b.archived) continue;

      const endUtcMs = parseYmdStringToUtcMs(b.end_date);
      if (endUtcMs == null) continue;

      const archiveAtUtcMs = endUtcMs + afterDays * 24 * 60 * 60 * 1000;
      if (todayUtcMs < archiveAtUtcMs) continue;

      const ch = await client.channels.fetch(b.channel_id).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        await updateBooking(b.booking_id, {
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: "channel missing"
        });
        continue;
      }

	await archiveChannelNow({
	  channel: ch,
	  booking: b,
	  reason: `Auto-Archiv (Abreise ${b.end_date} + ${afterDays} Tage)`,
	  actorUserId: null
	});
    }
  } catch (e) {
    console.error("archive sweep error:", e);
  }
}

/* ================== LOOPS ================== */
function startLoops() {
  const reminderMinutes = Math.max(5, Number(REMINDER_CHECK_MINUTES) || 60);
  const sweepMinutes = Math.max(5, Number(SWEEP_MINUTES) || 60);

  setTimeout(() => {
    runReminderSweep();
    runArchiveSweep();
  }, 10_000);

  setInterval(() => runReminderSweep(), reminderMinutes * 60 * 1000);
  setInterval(() => runArchiveSweep(), sweepMinutes * 60 * 1000);

  console.log(
    `⏱️ Loops: reminders every ${reminderMinutes}m days=[${parseReminderDays().join(",")}], archive every ${sweepMinutes}m after=${ARCHIVE_AFTER_DAYS}d (${TZ})`
  );
}

/* ================== HTTP ROUTES ================== */
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.post("/wpbs/new-booking", async (req, res) => {
  try {
    if (req.header("x-shared-secret") !== WP_SHARED_SECRET) {
      return res.status(401).send("unauthorized");
    }
    if (!client.isReady()) return res.status(503).send("bot not ready");

    const body = req.body || {};
    const booking_id = body.booking_id;
    if (!booking_id) return res.status(400).send("missing booking_id");

	const {
	  booking_date,
	  start_date,
	  end_date,
	  start_time,
	  end_time,
	  firstname,
	  lastname,
	  persons,
	  laundry_package,
	  club_name
	} = body;

    const fullName = [lastname, firstname].filter(Boolean).join(" ").trim();
    const zeitraum = buildZeitraum({
      start_date: normalizeDateToYMD(start_date),
      end_date: normalizeDateToYMD(end_date),
      start_time,
      end_time
    });

    const guild = await client.guilds.fetch(GUILD_ID);
    const me = await guild.members.fetchMe();

    if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return res.status(500).send("bot missing Manage Channels permission");
    }

    // Idempotenz: existiert booking schon?
    const existing = await getBooking(String(booking_id));
   if (existing?.channel_id) {
  const existingChannel = await client.channels.fetch(existing.channel_id).catch(() => null);
  if (existingChannel?.isTextBased()) {

		// Daten updaten (club_name, zeiten, etc.)
	await upsertBooking({
	  booking_id: String(booking_id),
	  start_date: normalizeDateToYMD(start_date),
	  end_date: normalizeDateToYMD(end_date),
	  start_time: start_time || null,
	  end_time: end_time || null,
	  booking_date: booking_date || null,
	  firstname: firstname || null,
	  lastname: lastname || null,
	  club_name: clubName,
	  persons: persons || null,
	  laundry_package: laundry_package || null,
	  channel_id: existing.channel_id,
	  channel_name: existing.channel_id ? (existing.channel_name || null) : null
	});

		// Optional: Topic direkt nachziehen
		const refreshedTopic =
		  `${zeitraum}${fullName ? ` | ${fullName}` : ""}${clubName ? ` | Verein: ${clubName}` : ""}`.slice(0, 1024);
		await existingChannel.setTopic(refreshedTopic).catch(() => {});

		return res.json({ ok: true, channel_id: existing.channel_id, reused: true, updated: true });
	  }
	}

    const safeId = String(booking_id).replace(/[^a-zA-Z0-9]/g, "");
    const nameSlug = slugify(fullName, 30);

    const arrival = normalizeDateToYMD(start_date);
    const channelName = [arrival, safeId, nameSlug].filter(Boolean).join("-").slice(0, 90);

const clubName = (club_name && String(club_name).trim()) || null;

const channel = await guild.channels.create({
  name: channelName,
  type: ChannelType.GuildText,
  parent: INTERNAL_CATEGORY_ID,
  topic: `${zeitraum}${fullName ? ` | ${fullName}` : ""}${clubName ? ` | Verein: ${clubName}` : ""}`.slice(0, 1024)
});

await auditLog(`📥 Neue Buchung ${booking_id} → Channel erstellt: <#${channel.id}>`);

// 1) Embed + Buttons bauen
const embed = {
  title: "Buchungsdetails",
  fields: [
    { name: "Name, Vorname", value: fullName || "—", inline: true },
    { name: "Verein", value: clubName || "—", inline: true },
    { name: "Buchungsdatum", value: booking_date || "—", inline: true },
    { name: "Booking-ID", value: String(booking_id), inline: true },
    { name: "Buchungszeitraum", value: zeitraum, inline: false },
    { name: "Personen", value: persons ? String(persons) : "—", inline: true },
    { name: "Wäschepaket", value: laundry_package ? String(laundry_package) : "—", inline: true }
  ]
};

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("assign_booking")
    .setLabel("Ich betreue diese Buchung")
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId("change_assignee")
    .setLabel("Betreuer ändern")
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId("archive_now")
    .setLabel("Archivieren jetzt")
    .setEmoji("📦")
    .setStyle(ButtonStyle.Danger)
);

// 2) Overview Message senden
const overviewMsg = await channel.send({
  content: "📥 Neue Buchung eingegangen",
  embeds: [embed],
  components: [row]
});

// 3) Booking speichern (inkl. Zeiten + clubName + overview_message_id)
await upsertBooking({
  cleaning_checklist: defaultCleaningChecklist(),
  cleaning_overview_message_id: null,
  cleaning_select_message_id: null,
  booking_id: String(booking_id),
  channel_id: channel.id,
  channel_name: channel.name,
  start_date: normalizeDateToYMD(start_date),
  end_date: normalizeDateToYMD(end_date),
  start_time: start_time || null,
  end_time: end_time || null,
  booking_date: booking_date || null,
  firstname: firstname || null,
  lastname: lastname || null,
  club_name: clubName,
  persons: persons || null,
  laundry_package: laundry_package || null,
  assignee: null,
  reminders_sent: {},
  archived: false,
  overview_message_id: overviewMsg.id
});

// 4) Cleaning UI
await ensureCleaningOverviewPinned(channel, String(booking_id));
await ensureCleaningSelectMessage(channel, String(booking_id));

await auditLog(`📥 Neue Buchung: **${booking_id}** → <#${channel.id}> (${fullName || "—"})`);

return res.json({ ok: true, channel_id: channel.id });
	  } catch (err) {
		console.error(err);
		return res.status(500).send("error");
	  }
	});

/* ================== BUTTONS ================== */
client.on("interactionCreate", async (interaction) => {
	 // ===== Slash Commands =====
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== "refresh") return;

    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Nur Admins dürfen /refresh nutzen.", ephemeral: true });
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: "❌ Das geht nur in einem Text-Channel.", ephemeral: true });
    }

    const bookingId = extractBookingIdFromChannelName(channel.name);
    if (!bookingId) {
      return interaction.reply({ content: "❌ Keine Booking-ID im Channelnamen gefunden.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const b = await getBooking(bookingId);
    if (!b) {
      return interaction.editReply("❌ Booking nicht in bookings.json gefunden.");
    }

    const fullName = [b.lastname, b.firstname].filter(Boolean).join(" ").trim();
    const zeitraum = buildZeitraum({
      start_date: b.start_date,
      end_date: b.end_date,
      start_time: b.start_time,
      end_time: b.end_time
    });

    const embed = {
      title: "Buchungsdetails",
      fields: [
        { name: "Name, Vorname", value: fullName || "—", inline: true },
        { name: "Verein", value: b.club_name ? String(b.club_name) : "—", inline: true },
        { name: "Buchungsdatum", value: b.booking_date || "—", inline: true },
        { name: "Booking-ID", value: String(b.booking_id), inline: true },
        { name: "Buchungszeitraum", value: zeitraum, inline: false },
        { name: "Personen", value: b.persons ? String(b.persons) : "—", inline: true },
        { name: "Wäschepaket", value: b.laundry_package ? String(b.laundry_package) : "—", inline: true }
      ]
    };

    // 1) bevorzugt: gespeicherte overview_message_id editieren
    let edited = false;
    if (b.overview_message_id) {
      const msg = await channel.messages.fetch(b.overview_message_id).catch(() => null);
      if (msg && msg.author?.id === client.user.id) {
        await msg.edit({ embeds: [embed] }).catch(() => {});
        edited = true;
      }
    }

    // 2) Fallback: letzte 50 Messages nach "Buchungsdetails" vom Bot durchsuchen
    if (!edited) {
      const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      const candidate = msgs?.find((m) =>
        m.author?.id === client.user.id &&
        (m.embeds?.[0]?.title === "Buchungsdetails")
      );

      if (candidate) {
        await candidate.edit({ embeds: [embed] }).catch(() => {});
        await updateBooking(bookingId, { overview_message_id: candidate.id });
        edited = true;
      }
    }

    // Topic optional aktualisieren (du nutzt Topic eh für Verein)
    const topic = `${zeitraum}${fullName ? ` | ${fullName}` : ""}${b.club_name ? ` | Verein: ${b.club_name}` : ""}`.slice(0, 1024);
    await channel.setTopic(topic).catch(() => {});

    await auditLog(`🔄 /refresh: **${bookingId}** in <#${channel.id}> von <@${interaction.user.id}> (${edited ? "embed aktualisiert" : "embed nicht gefunden"})`);
    return interaction.editReply(edited ? "✅ Aktualisiert (Embed + Topic)." : "⚠️ Topic aktualisiert, aber Buchungs-Embed nicht gefunden.");
  }
    if (!(interaction.isButton() || interaction.isStringSelectMenu())) return;
	
	if (interaction.isButton() && interaction.customId === "cleaning_finish") {
  const channel = interaction.channel;
  const bookingId = extractBookingIdFromChannelName(channel?.name);
  if (!bookingId) return interaction.reply({ content: "❌ Keine Booking-ID gefunden.", ephemeral: true });

  await interaction.deferUpdate();

  const b = await getBooking(bookingId);
  const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());

  // Nur wenn wirklich alles erledigt
  if (!allAreasCompleted(cleaning)) {
    await channel.send("ℹ️ Endreinigung kann erst abgeschlossen werden, wenn alle Bereiche erledigt sind.").catch(() => {});
    await ensureCleaningOverviewPinned(channel, bookingId);
    return;
  }

  // Idempotent: wenn schon abgeschlossen, nichts tun
  cleaning.meta ??= {};
  if (cleaning.meta.completed) {
    await ensureCleaningOverviewPinned(channel, bookingId);
    return;
  }

  cleaning.meta.completed = true;
  cleaning.meta.completed_at = new Date().toISOString();
  cleaning.meta.completed_by = interaction.member?.displayName || interaction.user.username;

  await updateBooking(bookingId, { cleaning_checklist: cleaning });

  // Optional: Topic ergänzen (wenn du willst)
  const topic = channel.topic || "";
  const cleanedTopic = topic.replace(/\s*\|\s*Reinigung:\s*[^|]+/i, "").trim();
  const newTopic = `${cleanedTopic}${cleanedTopic ? " | " : ""}Reinigung: abgeschlossen ✅`.slice(0, 1024);
  await channel.setTopic(newTopic).catch(() => {});

  await channel.send(`✅ **Endreinigung abgeschlossen** (von **${cleaning.meta.completed_by}**)`).catch(() => {});
  await ensureCleaningOverviewPinned(channel, bookingId);
  return;
}

  // ===== Select Menus (Dropdowns) =====
  if (interaction.isStringSelectMenu()) {

    // A) Bereich auswählen
    if (interaction.customId === "cleaning_select_area") {
	  const areaKey = interaction.values?.[0];
	  const channel = interaction.channel;
	  const bookingId = extractBookingIdFromChannelName(channel?.name);

	  // Wichtig: Interaction bestätigen, aber ohne Nachricht
	  await interaction.deferUpdate();

	  if (!bookingId) return;

	  const b = await getBooking(bookingId);
	  const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());

	  await updateBooking(bookingId, { cleaning_checklist: cleaning });

	  await upsertCleaningDetailMessage(channel, bookingId, areaKey);
	  await ensureCleaningOverviewPinned(channel, bookingId);

	  return;
	}

    // B) Task auswählen (für große Bereiche)
    if (interaction.customId.startsWith("cleaning_pick_task:")) {
      const areaKey = interaction.customId.split(":")[1];
      const taskKey = interaction.values?.[0];

      const channel = interaction.channel;
      const bookingId = extractBookingIdFromChannelName(channel?.name);
      if (!bookingId) return interaction.reply({ content: "❌ Keine Booking-ID gefunden.", ephemeral: true });

      const b = await getBooking(bookingId);
      const picked = { ...(b?.cleaning_picked_task || {}) };
      picked[areaKey] = taskKey;

		await interaction.deferUpdate(); // <-- wichtig: Interaction sauber bestätigen
		await updateBooking(bookingId, { cleaning_picked_task: picked });
		return;
    }

    return; // wichtig: SelectMenu fertig
  }


  const channel = interaction.channel;
  const member = interaction.member;
  const memberName = member?.displayName || interaction.user?.username || "Unbekannt";
  const bookingId = extractBookingIdFromChannelName(channel?.name);

  try {
	      // ===== Cleaning: Toggle (kleine Bereiche) =====
    if (interaction.customId.startsWith("cleaning_toggle:")) {
      const [, areaKey, taskKey] = interaction.customId.split(":");
      const channel = interaction.channel;
      const bookingId = extractBookingIdFromChannelName(channel?.name);
      if (!bookingId) return interaction.reply({ content: "❌ Keine Booking-ID gefunden.", ephemeral: true });

      await interaction.deferUpdate();

      const b = await getBooking(bookingId);
      const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());
      const task = cleaning.areas?.[areaKey]?.tasks?.[taskKey];
      if (!task) return;

      task.done = !task.done;
      task.done_by = task.done ? (interaction.member?.displayName || interaction.user.username) : null;
      task.done_at = task.done ? new Date().toISOString() : null;

      const tasks = Object.values(cleaning.areas[areaKey].tasks);
      cleaning.areas[areaKey].completed = tasks.every((t) => t.done);

      await updateBooking(bookingId, { cleaning_checklist: cleaning });

      await upsertCleaningDetailMessage(channel, bookingId, areaKey);
      await ensureCleaningOverviewPinned(channel, bookingId);
      return;
    }

    // ===== Cleaning: Toggle ausgewählte Aufgabe (große Bereiche) =====
    if (interaction.customId.startsWith("cleaning_toggle_picked:")) {
      const areaKey = interaction.customId.split(":")[1];
      const channel = interaction.channel;
      const bookingId = extractBookingIdFromChannelName(channel?.name);
      if (!bookingId) return interaction.reply({ content: "❌ Keine Booking-ID gefunden.", ephemeral: true });

      await interaction.deferUpdate();

      const b = await getBooking(bookingId);
      const picked = b?.cleaning_picked_task?.[areaKey];
      if (!picked) {
        await channel.send("ℹ️ Bitte zuerst im Dropdown eine Aufgabe auswählen.").catch(() => {});
        return;
      }

      const cleaning = ensureTasksInChecklist(b?.cleaning_checklist || defaultCleaningChecklist());
      const task = cleaning.areas?.[areaKey]?.tasks?.[picked];
      if (!task) return;

      task.done = !task.done;
      task.done_by = task.done ? (interaction.member?.displayName || interaction.user.username) : null;
      task.done_at = task.done ? new Date().toISOString() : null;

      const tasks = Object.values(cleaning.areas[areaKey].tasks);
      cleaning.areas[areaKey].completed = tasks.every((t) => t.done);

      await updateBooking(bookingId, { cleaning_checklist: cleaning });

      await upsertCleaningDetailMessage(channel, bookingId, areaKey);
      await ensureCleaningOverviewPinned(channel, bookingId);
      return;
    }
	  // 📦 Manuell archivieren (nur Admin)
	if (interaction.customId === "archive_now") {
	  if (!isAdmin(interaction.member)) {
		return interaction.reply({ content: "❌ Nur Admins können manuell archivieren.", ephemeral: true });
	  }

	  await interaction.deferUpdate();

	  const bookingId = extractBookingIdFromChannelName(channel.name);
	  const booking = bookingId ? await getBooking(bookingId) : null;

	  if (booking?.archived) {
	   await channel.send("🛠️ Archiv-Status war bereits gesetzt – ich versuche die Archivierung zu reparieren …").catch(() => {});
	   // NICHT returnen -> wir führen archiveChannelNow trotzdem aus
	  }

	  await archiveChannelNow({
		channel,
		booking: booking || { booking_id: bookingId || "?" },
		reason: "Manuell archiviert",
		actorUserId: interaction.user.id
	  });

	  return;
	}
    // 🔓 Reaktivieren (nur Admin)
    if (interaction.customId === "reactivate_booking") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Nur Admins können Buchungen reaktivieren.", ephemeral: true });
      }

      await interaction.deferUpdate();

      // Schreibrechte zurücksetzen (Reset auf Kategorie/Default)
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: null }).catch(() => {});

      // zurück in Buchungen
      await channel.setParent(INTERNAL_CATEGORY_ID, { lockPermissions: false });

      // 📦 Prefix entfernen
      if (channel.name.startsWith("📦-")) {
        await channel.setName(channel.name.replace(/^📦-/, "")).catch(() => {});
      }

      // Control-Pin entfernen
      const pins = await channel.messages.fetchPinned();
      for (const [, msg] of pins) {
        const hasReactivate =
          msg.author?.id === client.user.id &&
          msg.components?.some((row) => row.components?.some((c) => c.customId === "reactivate_booking"));

        if (hasReactivate) await msg.unpin().catch(() => {});
      }

      // booking archived=false
      const newBookingId = extractBookingIdFromChannelName(channel.name);
      if (newBookingId) {
        await updateBooking(newBookingId, { archived: false, reactivated_at: new Date().toISOString() });
      }

      await channel.send(`🔓 **Buchung reaktiviert** von <@${interaction.user.id}>`);
      await auditLog(`🔓 Reaktiviert: **${newBookingId || "?"}** in <#${channel.id}> von <@${interaction.user.id}>`);
      return;
    }

    // Betreuer setzen
    if (interaction.customId === "assign_booking") {
      const existing = getAssigneeFromTopic(channel.topic);
      if (existing) {
        return interaction.reply({
          content: `❌ Diese Buchung wird bereits betreut von **${existing}**.`,
          ephemeral: true
        });
      }

      const row = ActionRowBuilder.from(interaction.message.components[0]);
      row.components = row.components.map((c) => {
        const btn = ButtonBuilder.from(c);
        if (btn.data.custom_id === "assign_booking") btn.setDisabled(true).setLabel("Bereits betreut");
        return btn;
      });

      await interaction.update({ components: [row] });

      await channel.setTopic(setAssigneeInTopic(channel.topic, memberName));
      await pinSingleAssignee(channel, memberName, interaction.user.id);
      await channel.send(`✅ **${memberName}** betreut diese Buchung.`);

      if (bookingId) {
        await updateBooking(bookingId, {
          assignee: { user_id: interaction.user.id, display_name: memberName, assigned_at: new Date().toISOString() }
        });
      }

      await auditLog(`👤 Betreuer gesetzt: **${bookingId || "?"}** → ${memberName} (<@${interaction.user.id}>) in <#${channel.id}>`);
      return;
    }

    // Betreuer ändern (Admin)
    if (interaction.customId === "change_assignee") {
      if (!isAdmin(member)) {
        return interaction.reply({ content: "❌ Nur Admins dürfen den Betreuer ändern.", ephemeral: true });
      }

      await interaction.deferUpdate();

      await channel.setTopic(setAssigneeInTopic(channel.topic, memberName));
      await pinSingleAssignee(channel, memberName, interaction.user.id);
      await channel.send(`🔁 **Betreuer geändert:** ${memberName}`);

      if (bookingId) {
        await updateBooking(bookingId, {
          assignee: {
            user_id: interaction.user.id,
            display_name: memberName,
            assigned_at: new Date().toISOString(),
            changed_by_admin: true
          }
        });
      }

      await auditLog(`🔁 Betreuer geändert: **${bookingId || "?"}** → ${memberName} (<@${interaction.user.id}>) in <#${channel.id}>`);
      return;
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Fehler bei der Aktion.", ephemeral: true });
      }
    } catch {}
  }
});

/* ================== START ================== */
client.once("clientReady", async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("❌ registerCommands failed:", e);
  }
  startLoops();
});

client.login(DISCORD_TOKEN);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🌐 HTTP listening on :${PORT}`);
});
