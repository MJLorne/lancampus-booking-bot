import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

export function defaultCleaningChecklist() {
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
      sonstiges: { label: "Sonstiges", icon: "🧹", completed: false, tasks: {} },
    },
  };
}

export function ensureTasksInChecklist(cleaning) {
  const template = {
    gaming: [["plaetze", "Plätze aufräumen und putzen"], ["monitor", "Monitor mit Glasreiniger reinigen"], ["peripherie", "Maus/Tastatur/Headset reinigen"], ["tisch", "Tischplatte reinigen"], ["monitore", "Monitore einstellen"], ["stuehle", "Stühle gerade rücken"], ["teppiche", "Teppiche staubsaugen"]],
    badezimmer: [["handtuecher_sammeln", "Handtücher einsammeln"], ["handtuecher_waschen", "Handtücher waschen"], ["dusche", "Dusche reinigen"], ["muelleimer", "Mülleimer leeren"], ["toilette", "Toilette putzen"], ["waschbecken", "Waschbecken putzen"], ["wischen", "Wischen"]],
    gaeste_wc: [["muelleimer", "Mülleimer leeren"], ["toilette", "Toilette putzen"], ["waschbecken", "Waschbecken putzen"], ["staubsaugen", "Staubsaugen"], ["wischen", "Wischen"]],
    wohnzimmer: [["sofa", "Sofa gerade rücken"], ["kissen", "Kissen aufschütteln"], ["tische", "Tische abputzen"], ["staubsaugen", "Staubsaugen"], ["wischen", "Wischen"], ["tv", "ggf. TV abwischen (wenn fettige Finger)"]],
    kueche: [["spuelmaschine", "Spülmaschine leeren"], ["aufraeumen", "Aufräumen"], ["geschirr", "Geschirr auf Sauberkeit prüfen"], ["putzen", "Küche putzen"], ["kuehlschrank", "Kühlschrank auswischen"], ["wasserkocher", "Wasserkocher reinigen"], ["eierkocher", "Eierkocher reinigen"], ["kaffee", "Kaffeemaschine reinigen"], ["kuechenschraenke", "Küchenschränke innen und außen reinigen"], ["muelleimer", "Mülleimer leeren und reinigen"], ["backofen", "Backofen reinigen"], ["staubsaugen", "Staubsaugen"], ["wischen", "Wischen"]],
    schlafzimmer: [["betten", "Betten abziehen"], ["bettwaesche", "Bettwäsche waschen"], ["schraenke", "Schränke kontrollieren und reinigen"], ["bettkaesten", "Bettkästen kontrollieren und reinigen"], ["staubsaugen", "Staubsaugen"], ["bilder", "Bilder gerade rücken"], ["wischen", "Wischen"]],
    aussen: [["grill", "Grill reinigen"], ["moebel", "Möbel abputzen"], ["sitzkissen", "Sitzkissen rauslegen"], ["fegen", "Fegen"]],
    sonstiges: [["treppe", "Treppengeländer Staubwischen"], ["sockelleisten", "Sockelleisten Staubwischen"]],
  };

  for (const [areaKey, entries] of Object.entries(template)) {
    const area = cleaning.areas?.[areaKey];
    if (!area) continue;
    area.tasks ??= {};
    for (const [taskKey, label] of entries) {
      const existing = area.tasks[taskKey] && typeof area.tasks[taskKey] === "object"
        ? area.tasks[taskKey]
        : {};
      area.tasks[taskKey] = {
        label,
        done: false,
        done_by: null,
        done_at: null,
        ...existing,
      };
    }
  }
  return cleaning;
}

export function normalizeCleaningChecklist(cleaning) {
  const base = defaultCleaningChecklist();
  const source = cleaning && typeof cleaning === "object" ? structuredClone(cleaning) : {};
  const sourceAreas = source.areas && typeof source.areas === "object" ? source.areas : {};
  const areas = {};

  for (const key of new Set([...Object.keys(base.areas), ...Object.keys(sourceAreas)])) {
    const baseArea = base.areas[key] || { label: key, icon: "🧹", completed: false, tasks: {} };
    const sourceArea = sourceAreas[key] && typeof sourceAreas[key] === "object" ? sourceAreas[key] : {};
    areas[key] = {
      ...baseArea,
      ...sourceArea,
      tasks: {
        ...(baseArea.tasks || {}),
        ...(sourceArea.tasks && typeof sourceArea.tasks === "object" ? sourceArea.tasks : {}),
      },
    };
  }

  return ensureTasksInChecklist({
    ...base,
    ...source,
    meta: {
      ...base.meta,
      ...(source.meta && typeof source.meta === "object" ? source.meta : {}),
    },
    areas,
  });
}

export function allAreasCompleted(cleaning) {
  const areas = cleaning?.areas || {};
  return Object.values(areas).length > 0 && Object.values(areas).every((a) => a.completed);
}

export function isCleaningCompleted(cleaning) {
  return !!cleaning?.meta?.completed;
}

export function canArchiveBooking(booking) {
  const cleaning = normalizeCleaningChecklist(booking?.cleaning_checklist);
  return isCleaningCompleted(cleaning);
}

export function cleaningAreaSelectRow() {
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

export function cleaningFinishRow(cleaning) {
  const canFinish = allAreasCompleted(cleaning) && !isCleaningCompleted(cleaning);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cleaning_finish")
      .setLabel(isCleaningCompleted(cleaning) ? "Endreinigung abgeschlossen" : "Endreinigung abschließen")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canFinish)
  );
}

function escapeDiscordMentions(value) {
  return String(value || "").replace(/@/g, "@\u200b");
}

function renderBookingNotes(cleaning) {
  const notes = Array.isArray(cleaning?.meta?.notes) ? cleaning.meta.notes : [];
  if (!notes.length) return "_Keine Notizen hinterlegt._";

  const labels = {
    allgemein: "Notiz",
    sonderwunsch: "Sonderwunsch",
    schaden: "Schaden",
    fundsache: "Fundsache",
  };

  const visibleNotes = notes.slice(-5);
  const hiddenCount = notes.length - visibleNotes.length;
  const lines = visibleNotes.map((note) => {
    const label = labels[note?.type] || labels.allgemein;
    const rawText = escapeDiscordMentions(note?.text);
    const text = rawText.length > 180 ? `${rawText.slice(0, 177)}…` : rawText || "—";
    const author = escapeDiscordMentions(note?.created_by_name);
    return `• **${label}:** ${text}${author ? ` _(von ${author})_` : ""}`;
  });
  if (hiddenCount > 0) lines.unshift(`_${hiddenCount} ältere Notiz${hiddenCount === 1 ? "" : "en"} ausgeblendet._`);
  return lines.join("\n");
}

export function renderCleaningOverviewText(cleaning, booking = {}) {
  const assigneeId = String(booking?.assignee?.user_id || "");
  const assignee = /^\d{17,20}$/.test(assigneeId)
    ? `<@${assigneeId}>`
    : escapeDiscordMentions(booking?.assignee?.display_name) || "⚠️ noch nicht festgelegt";
  const areas = Object.values(cleaning?.areas || {});
  const lines = areas.map((a) => `${a.completed ? "🟢" : "⬜"} ${a.icon || "•"} ${a.label}`);
  const cleaningStatus = cleaning?.meta?.completed
    ? `✅ Abgeschlossen${cleaning.meta.completed_by ? ` von ${escapeDiscordMentions(cleaning.meta.completed_by)}` : ""}`
    : `${areas.filter((a) => a.completed).length}/${areas.length} Bereiche erledigt`;

  return [
    "🏠 **LanCampus – Organisation**",
    `👤 **Betreuer & Reinigung:** ${assignee}`,
    "",
    "📝 **Notizen & Sonderwünsche**",
    renderBookingNotes(cleaning),
    "",
    `🧹 **Reinigung:** ${cleaningStatus}`,
    ...lines,
    "",
    "_Bereich unten auswählen, um die Reinigungspunkte zu bearbeiten._",
  ].join("\n").slice(0, 2000);
}

export function renderAreaDetailText(area) {
  const lines = Object.values(area?.tasks || {}).map((t) => `${t.done ? "✅" : "⬜"} ${t.label}${t.done && t.done_by ? ` _(von ${t.done_by})_` : ""}`);
  return `${area.icon || "🧹"} **Reinigung – ${area.label}**\n\n${lines.join("\n")}`;
}

export function buildTaskControls(areaKey, area) {
  const entries = Object.entries(area?.tasks || {});

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cleaning_pick_tasks:${areaKey}`)
    .setPlaceholder("Aufgaben auswählen …")
    .setMinValues(1)
    .setMaxValues(Math.min(entries.length, 25))
    .addOptions(
      entries.slice(0, 25).map(([taskKey, task]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(task.label.slice(0, 100))
          .setValue(taskKey)
          .setEmoji(task.done ? "✅" : "⬜")
      )
    );

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cleaning_mark_done:${areaKey}`)
        .setLabel("Als erledigt markieren")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cleaning_mark_undone:${areaKey}`)
        .setLabel("Als offen markieren")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}
