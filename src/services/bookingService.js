import { ChannelType, PermissionsBitField } from "discord.js";
import { config } from "../config.js";
import {
  buildBookingEmbed,
  buildBookingActionRows,
  buildChannelTopic,
  buildAssigneeOptions
} from "../discord/renderers.js";
import {
  defaultCleaningChecklist,
  ensureTasksInChecklist,
  renderCleaningOverviewText,
  cleaningFinishRow,
  cleaningAreaSelectRow,
  renderAreaDetailText,
  buildTaskControls
} from "./cleaningService.js";
import { normalizeDateToYMD, buildFullName, slugify } from "../utils/booking.js";

function normalizePins(pins) {
  if (!pins) return [];
  if (Array.isArray(pins)) return pins;
  if (typeof pins.values === "function") return Array.from(pins.values());
  if (Symbol.iterator in Object(pins)) return Array.from(pins);
  return [];
}

export function canChangeAssignee(member) {
  return !!member?.roles?.cache?.some(
    (r) => r.name === config.adminRoleName || r.name === config.assigneeManagerRoleName
  );
}

export function isAdmin(member) {
  return !!member?.roles?.cache?.some((r) => r.name === config.adminRoleName);
}

export async function pinSingleAssignee(channel, assignee, setterUserId, clientUserId) {
  const pinsRaw = await channel.messages.fetchPins().catch(() => []);
  const pins = normalizePins(pinsRaw);

  for (const msg of pins) {
    if (msg.author?.id === clientUserId && msg.content?.startsWith("📌 **Betreuer:**")) {
      await msg.unpin().catch(() => {});
    }
  }

  const msg = await channel.send(`📌 **Betreuer:** ${assignee}\n(gesetzt von <@${setterUserId}>)`);
  await msg.pin().catch(() => {});
}

export async function syncOverviewMessage({ channel, booking, client, store, member }) {
  if (!channel?.isTextBased() || !booking) return false;

  await channel.guild.members.fetch().catch(() => {});
  const assigneeOptions = buildAssigneeOptions(channel.guild);

  const embed = buildBookingEmbed(booking);
  const rows = buildBookingActionRows(booking, member, assigneeOptions);

  if (booking.overview_message_id) {
    const msg = await channel.messages.fetch(booking.overview_message_id).catch(() => null);
    if (msg && msg.author?.id === client.user.id) {
      await msg
        .edit({
          content: "📥 Neue Buchung eingegangen",
          embeds: [embed],
          components: rows
        })
        .catch((err) => console.error("overview edit failed:", err?.message || err));
      return true;
    }
  }

  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const candidate = msgs?.find(
    (m) => m.author?.id === client.user.id && m.embeds?.[0]?.title === "Buchungsdetails"
  );

  if (candidate) {
    await candidate
      .edit({
        content: "📥 Neue Buchung eingegangen",
        embeds: [embed],
        components: rows
      })
      .catch((err) => console.error("overview fallback edit failed:", err?.message || err));

    if (candidate.id !== booking.overview_message_id) {
      await store.updateBooking(booking.booking_id, { overview_message_id: candidate.id });
    }
    return true;
  }

  return false;
}

export async function ensureCleaningOverviewPinned({ channel, bookingId, store }) {
  const booking = await store.getBooking(bookingId);
  const cleaning = ensureTasksInChecklist(booking?.cleaning_checklist || defaultCleaningChecklist());
  const text = renderCleaningOverviewText(cleaning);
  const components = [cleaningFinishRow(cleaning)];

  if (booking?.cleaning_overview_message_id) {
    const msg = await channel.messages.fetch(booking.cleaning_overview_message_id).catch(() => null);
    if (msg) {
      await msg.edit({ content: text, components }).catch(() => {});
      const pinsRaw = await channel.messages.fetchPins().catch(() => []);
      const pins = normalizePins(pinsRaw);
      
      if (!pins.some((m) => m.id === msg.id)) {
        await msg.pin().catch(() => {});
      }
      return msg;
    }
  }

  const msg = await channel.send({ content: text, components });
  await msg.pin().catch(() => {});
  await store.updateBooking(bookingId, {
    cleaning_checklist: cleaning,
    cleaning_overview_message_id: msg.id
  });
  return msg;
}

export async function ensureCleaningSelectMessage({ channel, bookingId, store }) {
  const booking = await store.getBooking(bookingId);
  if (booking?.cleaning_select_message_id) {
    const msg = await channel.messages.fetch(booking.cleaning_select_message_id).catch(() => null);
    if (msg) {
      await msg
        .edit({
          content: "🧼 **Reinigung** – Bereich auswählen:",
          components: [cleaningAreaSelectRow()]
        })
        .catch(() => {});
      return msg;
    }
  }
  const msg = await channel.send({
    content: "🧼 **Reinigung** – Bereich auswählen:",
    components: [cleaningAreaSelectRow()]
  });
  await store.updateBooking(bookingId, { cleaning_select_message_id: msg.id });
  return msg;
}

export async function upsertCleaningDetailMessage({ channel, bookingId, areaKey, store }) {
  const booking = await store.getBooking(bookingId);
  const cleaning = ensureTasksInChecklist(booking?.cleaning_checklist || defaultCleaningChecklist());
  const area = cleaning.areas?.[areaKey];
  if (!area) return null;

  const content = renderAreaDetailText(area);
  const components = buildTaskControls(areaKey, area);

  if (booking?.cleaning_detail_message_id) {
    const msg = await channel.messages.fetch(booking.cleaning_detail_message_id).catch(() => null);
    if (msg) {
      await msg.edit({ content, components }).catch(() => {});
      await store.updateBooking(bookingId, { cleaning_checklist: cleaning });
      return msg;
    }
  }

  const msg = await channel.send({ content, components });
  await store.updateBooking(bookingId, {
    cleaning_checklist: cleaning,
    cleaning_detail_message_id: msg.id
  });
  return msg;
}

export async function syncBookingChannel({ channel, booking, client, store, member }) {
  if (!channel?.isTextBased() || !booking) return false;
  await channel
    .setTopic(buildChannelTopic(booking))
    .catch((err) => console.error("setTopic failed:", err?.message || err));

  const edited = await syncOverviewMessage({ channel, booking, client, store, member });
  await ensureCleaningOverviewPinned({ channel, bookingId: String(booking.booking_id), store });
  await ensureCleaningSelectMessage({ channel, bookingId: String(booking.booking_id), store });
  return edited;
}

export async function createOrUpdateBookingFromWebhook({ body, client, store, audit }) {
  const bookingId = body.booking_id;
  if (!bookingId) throw new Error("missing booking_id");

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

  const clubName = (club_name && String(club_name).trim()) || null;
  const normalizedStartDate = normalizeDateToYMD(start_date);
  const normalizedEndDate = normalizeDateToYMD(end_date);
  const fullName = buildFullName(lastname, firstname);

  const guild = await client.guilds.fetch(config.guildId);
  const me = await guild.members.fetchMe();

  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    throw new Error("bot missing Manage Channels permission");
  }

  const existing = await store.getBooking(String(bookingId));
  if (existing?.channel_id) {
    const existingChannel = await client.channels.fetch(existing.channel_id).catch(() => null);
    if (existingChannel?.isTextBased()) {
      const updatedBooking = await store.upsertBooking({
        booking_id: String(bookingId),
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
        start_time: start_time || null,
        end_time: end_time || null,
        booking_date: booking_date || null,
        firstname: firstname || null,
        lastname: lastname || null,
        club_name: clubName,
        persons: persons || null,
        laundry_package: laundry_package || null,
        channel_id: existing.channel_id,
        channel_name: existing.channel_name || existingChannel.name || null
      });

      await syncBookingChannel({
        channel: existingChannel,
        booking: updatedBooking,
        client,
        store,
        member: null
      });

      return { channelId: existing.channel_id, reused: true, updated: true };
    }
  }

  const safeId = String(bookingId).replace(/[^a-zA-Z0-9]/g, "");
  const nameSlug = slugify(fullName, 30);
  const channelName = [normalizedStartDate, safeId, nameSlug]
    .filter(Boolean)
    .join("-")
    .slice(0, 90);

  const initialBooking = {
    cleaning_checklist: defaultCleaningChecklist(),
    cleaning_overview_message_id: null,
    cleaning_select_message_id: null,
    booking_id: String(bookingId),
    start_date: normalizedStartDate,
    end_date: normalizedEndDate,
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
    archived: false
  };

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.internalCategoryId,
    topic: buildChannelTopic(initialBooking)
  });

  await audit.log(`📥 Neue Buchung ${bookingId} → Channel erstellt: <#${channel.id}>`);

  await guild.members.fetch().catch(() => {});
  const assigneeOptions = buildAssigneeOptions(guild);

  const overviewMsg = await channel.send({
    content: "📥 Neue Buchung eingegangen",
    embeds: [buildBookingEmbed(initialBooking)],
    components: buildBookingActionRows(initialBooking, null, assigneeOptions)
  });

  const savedBooking = await store.upsertBooking({
    ...initialBooking,
    channel_id: channel.id,
    channel_name: channel.name,
    overview_message_id: overviewMsg.id
  });

  await ensureCleaningOverviewPinned({ channel, bookingId: String(bookingId), store });
  await ensureCleaningSelectMessage({ channel, bookingId: String(bookingId), store });
  await syncBookingChannel({ channel, booking: savedBooking, client, store, member: null });

  await audit.log(`📥 Neue Buchung: **${bookingId}** → <#${channel.id}> (${fullName || "—"})`);
  return { channelId: channel.id, reused: false, updated: false };
}
