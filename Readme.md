# LanCampus Booking Bot (modular)

Modulare Struktur für den Discord-Bot, der Buchungen aus WordPress (WP Booking System) per Webhook annimmt und in Discord-Channels mit Cleaning-Workflow und Archivierung abbildet.

## Features

- `POST /wpbs/new-booking` Webhook mit Shared Secret
- idempotente Buchungsanlage über `booking_id`
- persistente Speicherung in `bookings.json`
- Channel-Topic, Buchungs-Embed und Cleaning-UI werden zentral synchronisiert
- Betreuer setzen / ändern
- Endreinigung mit Bereichs- und Aufgabenstatus
- manuelle und automatische Archivierung nur bei abgeschlossener Endreinigung
- `/refresh` zum Reparieren des Discord-Zustands aus `bookings.json`

## Projektstruktur

```text
src/
  app.js
  config.js
  storage/
    bookingStore.js
  discord/
    client.js
    commands.js
    interactions.js
    renderers.js
  services/
    archiveService.js
    auditService.js
    bookingService.js
    cleaningService.js
    reminderService.js
  http/
    routes.js
  utils/
    booking.js
    date.js
```

## Start lokal

```bash
cp .env.example .env
npm install
npm start
```

## Deployment-Hinweis

Für Docker Swarm solltest du `DATA_DIR` auf dein NFS-Volume mappen, z. B. `/data`.
