import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { config } from "../config.js";

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
      area.tasks[taskKey] ??= { label, done: false, done_by: null, done_at: null };
    }
  }
  return cleaning;
}

export function allAreasCompleted(cleaning) {
  const areas = cleaning?.areas || {};
  return Object.values(areas).length > 0 && Object.values(areas).every((a) => a.completed);
}

export function isCleaningCompleted(cleaning) {
  return !!cleaning?.meta?.completed;
}

export function canArchiveBooking(booking) {
  const cleaning = ensureTasksInChecklist(booking?.cleaning_checklist || defaultCleaningChecklist());
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

export function renderCleaningOverviewText(cleaning) {
  const lines = Object.values(cleaning?.areas || {}).map((a) => `${a.completed ? "🟢" : "⬜"} ${a.icon || "•"} ${a.label}`);
  return `🧹 **Reinigung – Übersicht**\n${lines.join("\n")}\n\n_Öffne später einen Bereich, um die Detailpunkte abzuhaken._`;
}

export function renderAreaDetailText(area) {
  const lines = Object.values(area?.tasks || {}).map((t) => `${t.done ? "✅" : "⬜"} ${t.label}${t.done && t.done_by ? ` _(von ${t.done_by})_` : ""}`);
  return `${area.icon || "🧹"} **Reinigung – ${area.label}**\n\n${lines.join("\n")}`;
}

export function buildTaskControls(areaKey, area) {
  const entries = Object.entries(area?.tasks || {});
  if (entries.length <= config.smallAreaTasksMax) {
    return [new ActionRowBuilder().addComponents(
      ...entries.slice(0, config.smallAreaTasksMax).map(([taskKey, task]) =>
        new ButtonBuilder()
          .setCustomId(`cleaning_toggle:${areaKey}:${taskKey}`)
          .setLabel(task.label.slice(0, 80))
          .setStyle(task.done ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    )];
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cleaning_pick_task:${areaKey}`)
    .setPlaceholder("Aufgabe auswählen …")
    .addOptions(entries.slice(0, 25).map(([taskKey, task]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(task.label.slice(0, 100))
        .setValue(taskKey)
        .setEmoji(task.done ? "✅" : "⬜")
    ));

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cleaning_toggle_picked:${areaKey}`).setLabel("Aufgabe umschalten").setStyle(ButtonStyle.Primary)
    )
  ];
}
