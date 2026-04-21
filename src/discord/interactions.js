import { MessageFlags } from "discord.js";
import { config } from "../config.js";
import { getAssigneeFromTopic } from "./renderers.js";
import {
  allAreasCompleted,
  defaultCleaningChecklist,
  ensureTasksInChecklist,
  canArchiveBooking,
} from "../services/cleaningService.js";
import {
  canChangeAssignee,
  ensureCleaningOverviewPinned,
  pinSingleAssignee,
  syncBookingChannel,
  upsertCleaningDetailMessage,
  isAdmin,
} from "../services/bookingService.js";
import { handleChatInputCommand } from "./commands.js";

export function registerInteractionHandlers(client, deps) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const handled = await handleChatInputCommand(interaction, deps);
        if (handled) return;
      }

      if (!(interaction.isButton() || interaction.isStringSelectMenu())) {
        return;
      }

      const { store, audit, archiveService } = deps;
      const channel = interaction.channel;
      const member = interaction.member;
      const memberName = member?.displayName || interaction.user?.username || "Unbekannt";
      const channelBooking = await store.getBookingByChannelId(channel?.id);
      const bookingId = channelBooking?.booking_id;

      if (interaction.isButton() && interaction.customId === "cleaning_finish") {
        if (!bookingId) {
          await interaction.reply({ content: "❌ Keine Booking-ID gefunden.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferUpdate();

        const cleaning = ensureTasksInChecklist(
          channelBooking?.cleaning_checklist || defaultCleaningChecklist()
        );

        if (!allAreasCompleted(cleaning)) {
          await channel.send(
            "ℹ️ Endreinigung kann erst abgeschlossen werden, wenn alle Bereiche erledigt sind."
          ).catch(() => {});
          await ensureCleaningOverviewPinned({ channel, bookingId, store });
          return;
        }

        if (!cleaning.meta?.completed) {
          cleaning.meta.completed = true;
          cleaning.meta.completed_at = new Date().toISOString();
          cleaning.meta.completed_by = memberName;

          const updatedBooking = await store.updateBooking(bookingId, {
            cleaning_checklist: cleaning
          });

          await channel.send(`✅ **Endreinigung abgeschlossen** (von **${memberName}**)`).catch(() => {});
          await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });
        } else {
          await ensureCleaningOverviewPinned({ channel, bookingId, store });
        }
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === "select_assignee") {
        if (!canChangeAssignee(member)) {
          await interaction.reply({
            content: "❌ Nur Admins oder berechtigte Staff-Rollen dürfen den Betreuer ändern.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const selectedUserId = interaction.values?.[0];
        const booking = await store.getBookingByChannelId(channel.id);

        if (!booking) {
          await interaction.reply({
            content: "❌ Buchung konnte nicht geladen werden.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const memberObj = await interaction.guild.members.fetch(selectedUserId);

        const updatedBooking = await store.updateBooking(booking.booking_id, {
          assignee: {
            user_id: memberObj.id,
            display_name: memberObj.displayName,
            assigned_at: new Date().toISOString(),
            changed_by_admin: true
          }
        });

        await interaction.reply({
          content: `👤 Betreuer geändert auf **${memberObj.displayName}**`,
          flags: MessageFlags.Ephemeral
        });

        await pinSingleAssignee(channel, memberObj.displayName, memberObj.id, client.user.id);
        await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });

        await audit.log(
          `🔁 Betreuer geändert: **${booking.booking_id}** → ${memberObj.displayName} (<@${memberObj.id}>) in <#${channel.id}>`
        );
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "cleaning_select_area") {
          const areaKey = interaction.values?.[0];
          if (!bookingId) return;

          await interaction.deferUpdate();

          const cleaning = ensureTasksInChecklist(
            channelBooking?.cleaning_checklist || defaultCleaningChecklist()
          );

          const updatedBooking = await store.updateBooking(bookingId, {
            cleaning_checklist: cleaning
          });

          await upsertCleaningDetailMessage({ channel, bookingId, areaKey, store });
          await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });
          return;
        }

        if (interaction.customId.startsWith("cleaning_pick_tasks:")) {
          const areaKey = interaction.customId.split(":")[1];

          if (!bookingId) {
            await interaction.reply({
              content: "❌ Keine Booking-ID gefunden.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const picked = { ...(channelBooking?.cleaning_picked_task || {}) };
          picked[areaKey] = interaction.values;

          await interaction.deferUpdate();
          await store.updateBooking(bookingId, { cleaning_picked_task: picked });
          return;
        }
      }

      if (interaction.isButton() && (
        interaction.customId.startsWith("cleaning_toggle:") ||
        interaction.customId.startsWith("cleaning_toggle_picked:")
      )) {
        await interaction.reply({
          content: "🔄 Die Reinigungsansicht wurde aktualisiert. Bitte wähle den Bereich erneut aus dem Dropdown.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.isButton() && (
        interaction.customId.startsWith("cleaning_mark_done:") ||
        interaction.customId.startsWith("cleaning_mark_undone:")
      )) {
        const [action, areaKey] = interaction.customId.split(":");
        const markDone = action === "cleaning_mark_done";

        if (!bookingId) {
          await interaction.reply({ content: "❌ Keine Booking-ID gefunden.", flags: MessageFlags.Ephemeral });
          return;
        }

        const pickedRaw = channelBooking?.cleaning_picked_task?.[areaKey];
        const pickedKeys = Array.isArray(pickedRaw) ? pickedRaw : pickedRaw ? [pickedRaw] : [];

        if (!pickedKeys.length) {
          await interaction.reply({
            content: "ℹ️ Bitte zuerst Aufgaben im Dropdown auswählen.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();

        const cleaning = ensureTasksInChecklist(
          channelBooking?.cleaning_checklist || defaultCleaningChecklist()
        );

        for (const taskKey of pickedKeys) {
          const task = cleaning.areas?.[areaKey]?.tasks?.[taskKey];
          if (!task) continue;
          task.done = markDone;
          task.done_by = markDone ? memberName : null;
          task.done_at = markDone ? new Date().toISOString() : null;
        }
        cleaning.areas[areaKey].completed = Object.values(cleaning.areas[areaKey].tasks).every((t) => t.done);

        const updatedBooking = await store.updateBooking(bookingId, { cleaning_checklist: cleaning });
        await upsertCleaningDetailMessage({ channel, bookingId, areaKey, store });
        await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });
        return;
      }

      if (interaction.isButton() && interaction.customId === "archive_now") {
        if (!isAdmin(interaction.member)) {
          await interaction.reply({
            content: "❌ Nur Admins können manuell archivieren.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();

        const booking = await store.getBookingByChannelId(channel.id);
        if (!booking) {
          await channel.send("❌ Buchung konnte nicht geladen werden.").catch(() => {});
          return;
        }

        if (!canArchiveBooking(booking)) {
          await channel.send(
            "❌ Archivierung nicht möglich: Die Endreinigung ist noch nicht abgeschlossen."
          ).catch(() => {});
          return;
        }

        await archiveService.archiveChannelNow({
          channel,
          booking,
          reason: "Manuell archiviert",
          actorUserId: interaction.user.id
        });
        return;
      }

      if (interaction.isButton() && interaction.customId === "reactivate_booking") {
        if (!isAdmin(interaction.member)) {
          await interaction.reply({
            content: "❌ Nur Admins können Buchungen reaktivieren.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();

        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
          SendMessages: null
        }).catch(() => {});

        await channel.setParent(config.internalCategoryId, { lockPermissions: false });

        if (channel.name.startsWith("📦-")) {
          await channel.setName(channel.name.replace(/^📦-/, "")).catch(() => {});
        }

        const pinsRaw = await channel.messages.fetchPins().catch(() => []);
        const pins = Array.isArray(pinsRaw)
          ? pinsRaw
          : typeof pinsRaw?.values === "function"
            ? Array.from(pinsRaw.values())
            : Symbol.iterator in Object(pinsRaw)
              ? Array.from(pinsRaw)
              : [];
        
        for (const msg of pins) {
          const hasReactivate =
            msg.author?.id === client.user.id &&
            msg.components?.some((row) =>
              row.components?.some((c) => c.customId === "reactivate_booking")
            );

          if (hasReactivate) {
            await msg.unpin().catch(() => {});
            await msg.edit({
              content: "🔓 **Diese Buchung wurde reaktiviert.**",
              components: []
            }).catch(() => {});
          }
        }

        const booking = await store.getBookingByChannelId(channel.id);
        if (booking?.booking_id) {
          const updatedBooking = await store.updateBooking(booking.booking_id, {
            archived: false,
            reactivated_at: new Date().toISOString()
          });

          await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });
          await audit.log(`🔓 Reaktiviert: **${booking.booking_id}** in <#${channel.id}> von <@${interaction.user.id}>`);
        }

        await channel.send(`🔓 **Buchung reaktiviert** von <@${interaction.user.id}>`);
        return;
      }

      if (interaction.isButton() && interaction.customId === "assign_booking") {
        const existing = channelBooking?.assignee?.display_name || getAssigneeFromTopic(channel.topic);

        if (existing) {
          await interaction.reply({
            content: `❌ Diese Buchung wird bereits betreut von **${existing}**.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferUpdate();
        await pinSingleAssignee(channel, memberName, interaction.user.id, client.user.id);
        await channel.send(`✅ **${memberName}** betreut diese Buchung.`);

        if (bookingId) {
          const updatedBooking = await store.updateBooking(bookingId, {
            assignee: {
              user_id: interaction.user.id,
              display_name: memberName,
              assigned_at: new Date().toISOString(),
            },
          });

          await syncBookingChannel({ channel, booking: updatedBooking, client, store, member });
        }

        await audit.log(
          `👤 Betreuer gesetzt: **${bookingId || "?"}** → ${memberName} (<@${interaction.user.id}>) in <#${channel.id}>`
        );
        return;
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Fehler bei der Aktion.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch {}
    }
  });
}
