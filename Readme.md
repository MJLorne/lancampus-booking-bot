# LanCampus Booking Bot

![Node](https://img.shields.io/badge/node-%3E=20-green)
![Docker](https://img.shields.io/badge/docker-swarm-blue)
![PostgreSQL](https://img.shields.io/badge/postgres-18-blue)
![Discord](https://img.shields.io/badge/discord-bot-5865F2)

Discord‑Bot zur Verwaltung von **LanCampus Buchungen** inklusive
Betreuer‑Zuweisung, Reinigungs‑Workflow und automatischer Archivierung.

Der Bot wird produktiv auf einem **Docker Swarm Cluster (Raspberry Pi
ARM64)** betrieben und integriert sich direkt in ein **WordPress Booking
System**.

------------------------------------------------------------------------

# Features

## Automatische Buchungs-Channels

WordPress sendet einen Webhook:

    POST /wpbs/new-booking

Der Bot erstellt automatisch einen Discord‑Channel:

    YYYY-MM-DD-bookingid-name

Beispiel:

    2026-04-12-1023-Mueller

Der Channel enthält:

-   Buchungsdetails (Embed)
-   Betreuer-System
-   Reinigungscheckliste
-   Archiv-Buttons

Wird der gleiche Webhook erneut gesendet (z.B. bei Buchungsänderung),
wird der bestehende Channel aktualisiert statt ein neuer erstellt.

------------------------------------------------------------------------

# Betreuer System

Button im Channel:

    Ich betreue diese Buchung

oder Admin-Dropdown:

    Betreuer auswählen

Nur folgende Rollen dürfen Betreuer ändern:

-   Admin (konfigurierbar via `ADMIN_ROLE_NAME`)
-   LanCampus-Staff (konfigurierbar via `ASSIGNEE_MANAGER_ROLE_NAME`)

Der aktuelle Betreuer wird im Channel-Topic und als gepinnte Nachricht
gespeichert. Bei Zuweisung erhält der Betreuer automatisch eine Discord-DM
mit Buchungsdetails (Zeitraum, Gast, Channel-Link).

------------------------------------------------------------------------

# Reinigungssystem

Jede Buchung erhält automatisch eine **Cleaning Checklist**.

Workflow:

    Bereich auswählen
    ↓
    Mehrere Aufgaben gleichzeitig auswählen (Multi-Select)
    ↓
    "Als erledigt markieren" oder "Als offen markieren"
    ↓
    Endreinigung abschließen (wenn alle Bereiche fertig)

Bereiche:

-   Gaming
-   Badezimmer
-   Gäste‑WC
-   Wohnzimmer
-   Küche
-   Schlafzimmer
-   Außenbereich
-   Sonstiges

Wenn alle Bereiche abgeschlossen sind, wird der Button
„Endreinigung abschließen" aktiv. Erst danach kann archiviert werden.

Nach dem Abschluss wird automatisch ein **Reinigungsbericht** im Channel
gepostet (welche Bereiche von wem erledigt wurden).

------------------------------------------------------------------------

# Automatische Archivierung

Ein Channel wird archiviert wenn:

    cleaning.meta.completed === true

und der Abreisezeitpunkt + `ARCHIVE_AFTER_DAYS` erreicht ist,
oder manuell durch einen Admin.

Archivierung:

-   Channel wird in die Archiv-Kategorie verschoben
-   Channel wird für normale User gesperrt (konfigurierbar)
-   Channel wird mit `📦-` Präfix markiert
-   Reaktivierung durch Admin jederzeit möglich

------------------------------------------------------------------------

# Reminder-System

Vor der Anreise werden automatisch Reminder an den zugewiesenen
Betreuer gesendet.

Konfigurierbar via `REMINDER_DAYS` (z.B. `7,1` für 7 und 1 Tag vorher).

Verpasste Reminder (z.B. bei Bot-Downtime) werden beim nächsten Sweep
nachgeholt, solange die Anreise noch in der Zukunft liegt.

------------------------------------------------------------------------

# Slash Commands

| Command    | Berechtigung       | Funktion                                  |
|------------|--------------------|-------------------------------------------|
| `/refresh` | Manage Channels    | Embed, Topic und Reinigungsübersicht aktualisieren |

------------------------------------------------------------------------

# Architektur

    WordPress
       │
       │ Webhook (POST /wpbs/new-booking)
       ▼
    Booking Bot (Node.js)
       │
       ├ Discord API
       ├ PostgreSQL
       └ Docker Swarm

Komponenten:

  Komponente            Beschreibung
  --------------------- ----------------------------
  Discord Bot           Node.js Bot mit discord.js
  PostgreSQL            Persistente Speicherung
  Docker Swarm          Deployment (Raspberry Pi ARM64)
  GitHub Actions        CI/CD (multi-arch build mit Registry-Cache)
  Nginx Proxy Manager   Reverse Proxy

------------------------------------------------------------------------

# Technologie Stack

  Technologie      Version
  ---------------- ---------
  Node.js          >=20
  discord.js       v14
  PostgreSQL       18
  Docker           Swarm
  GitHub Actions   CI/CD

------------------------------------------------------------------------

# Projektstruktur

    src/
      app.js
      config.js

      discord/
        client.js
        commands.js
        interactions.js
        renderers.js

      services/
        bookingService.js
        cleaningService.js
        archiveService.js
        reminderService.js
        auditService.js

      storage/
        jsonBookingStore.js
        postgresBookingStore.js
        index.js

      http/
        routes.js

      utils/
        booking.js
        date.js

    docker/
      stack-test.yml
      postgres/init/
        001-bookings.sql
        002-indexes.sql
        003-migrations.sql

    scripts/
      migrate-json-to-postgres.js

------------------------------------------------------------------------

# Installation

## Voraussetzungen

-   Docker mit Swarm-Modus
-   PostgreSQL 18
-   Discord Bot Token (mit `Guilds` und `GuildMembers` Intent)

------------------------------------------------------------------------

# Deployment

Docker Stack deployen:

    docker stack deploy -c docker/stack-test.yml lancampus-booking-bot

------------------------------------------------------------------------

# Environment Variablen

  Variable                    Beschreibung                              Standard
  --------------------------- ----------------------------------------- ----------
  DISCORD_TOKEN               Discord Bot Token                         –
  GUILD_ID                    Discord Server ID                         –
  INTERNAL_CATEGORY_ID        Kategorie für aktive Buchungen            –
  WP_SHARED_SECRET            WordPress Webhook Secret                  –
  ARCHIVE_CATEGORY_ID         Kategorie für archivierte Buchungen       –
  AUDIT_CHANNEL_ID            Channel für Audit-Logs                    (leer)
  NOTIFY_ROLE_ID              Rolle, die bei neuer Buchung gepingt wird (leer)
  OVERVIEW_CHANNEL_ID         Channel für Buchungsübersicht             (leer)
  ADMIN_ROLE_NAME             Name der Admin-Rolle                      Admin
  ASSIGNEE_MANAGER_ROLE_NAME  Name der Staff-Rolle                      LanCampus-Staff
  STORAGE_DRIVER              `json` oder `postgres`                    json
  DATABASE_URL                PostgreSQL Verbindungs-URL                –
  REMINDER_DAYS               Komma-getrennte Tage vor Anreise          7,1
  REMINDER_CHECK_MINUTES      Interval des Reminder-Sweeps (min)        60
  ARCHIVE_AFTER_DAYS          Tage nach Abreise bis Archivierung        7
  ARCHIVE_LOCK_CHANNEL        Channel nach Archivierung sperren         true
  SWEEP_MINUTES               Interval des Archiv-Sweeps (min)          60
  PORT                        HTTP Port                                  3000
  TZ                          Zeitzone                                  Europe/Berlin
  DATA_DIR                    Datenpfad für JSON-Storage                /data

Beispiel:

    DATABASE_URL=postgres://bookingbot:password@postgres:5432/bookingbot

------------------------------------------------------------------------

# Datenbank-Migration (bestehende Installation)

Bei Updates müssen neue Spalten manuell migriert werden:

    docker exec $(docker ps --filter name=postgres -q) \
      psql -U bookingbot -d bookingbot \
      -f /docker-entrypoint-initdb.d/003-migrations.sql

------------------------------------------------------------------------

# Migration JSON → PostgreSQL

Falls ältere JSON-Daten vorhanden sind:

    docker exec -it <bot_container> node scripts/migrate-json-to-postgres.js

------------------------------------------------------------------------

# Backup

    pg_dump bookingbot | gzip > bookingbot_$(date +%Y-%m-%d).sql.gz

Restore:

    gunzip -c backup.sql.gz | psql bookingbot

Ein automatischer täglicher Backup-Service ist im Stack enthalten
(`postgres-backup`).

------------------------------------------------------------------------

# CI/CD

GitHub Actions baut automatisch Docker Images mit Registry-Cache
(schnellere Builds bei reinen Code-Änderungen).

  Branch   Image
  -------- --------
  main     latest
  dev      test

Docker Registry:

    ghcr.io/mjlorne/lancampus-booking-bot

------------------------------------------------------------------------

# Testsystem

Der Bot kann parallel in einem Testsystem betrieben werden:

-   separater Discord Server
-   eigener Bot Token
-   `docker/stack-test.yml` als Stack-Vorlage

------------------------------------------------------------------------

# Wartung

## Logs

    docker service logs lancampus-booking-bot_bot

## Container prüfen

    docker service ps lancampus-booking-bot_bot

## Reinigungsansicht nach Update aktualisieren

Nach einem Bot-Update `/refresh` in jedem aktiven Buchungs-Channel
ausführen, um alte UI-Elemente zu aktualisieren.

------------------------------------------------------------------------

# Lizenz

Private Project – LanCampus
