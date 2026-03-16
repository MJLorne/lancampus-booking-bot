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

-   Buchungsdetails
-   Betreuer-System
-   Reinigungscheckliste
-   Archiv-Buttons

------------------------------------------------------------------------

# Betreuer System

Buttons im Channel:

    Ich betreue diese Buchung

oder Admin Dropdown:

    Betreuer auswählen

Nur folgende Rollen dürfen Betreuer ändern:

-   Admin
-   LanCampus-Staff

Der aktuelle Betreuer wird im Channel Topic gespeichert.

------------------------------------------------------------------------

# Reinigungssystem

Jede Buchung erhält automatisch eine **Cleaning Checklist**.

Workflow:

    Bereich auswählen
    ↓
    Aufgabe auswählen
    ↓
    Aufgabe erledigen

Bereiche:

-   Gaming
-   Badezimmer
-   Gäste‑WC
-   Wohnzimmer
-   Küche
-   Schlafzimmer
-   Außenbereich
-   Sonstiges

Wenn alle Aufgaben erledigt sind:

    Endreinigung abschließen

------------------------------------------------------------------------

# Automatische Archivierung

Ein Channel wird archiviert wenn:

    cleaning.meta.completed === true

oder manuell durch Admin.

Archivierung:

-   Channel wird verschoben
-   Channel wird geschlossen
-   Channel wird markiert

------------------------------------------------------------------------

# Architektur

    WordPress
       │
       │ Webhook
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
  Docker Swarm          Deployment
  GitHub Actions        CI/CD
  Nginx Proxy Manager   Reverse Proxy

------------------------------------------------------------------------

# Technologie Stack

  Technologie      Version
  ---------------- ---------
  Node.js          \>=20
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

    storage/
    jsonBookingStore.js
    postgresBookingStore.js
    index.js

    docker/
    stack-test.yml
    postgres/init/001-bookings.sql

    scripts/
    migrate-json-to-postgres.js

------------------------------------------------------------------------

# Installation

## Voraussetzungen

-   Docker
-   Docker Swarm
-   PostgreSQL
-   Discord Bot Token

------------------------------------------------------------------------

# Deployment

Docker Stack deployen:

    docker stack deploy -c stack.yml lancampus-booking-bot

------------------------------------------------------------------------

# Environment Variablen

  Variable               Beschreibung
  ---------------------- --------------------------
  DISCORD_TOKEN          Discord Bot Token
  GUILD_ID               Discord Server ID
  INTERNAL_CATEGORY_ID   Kategorie für Buchungen
  ARCHIVE_CATEGORY_ID    Archiv Kategorie
  WP_SHARED_SECRET       WordPress Webhook Secret
  STORAGE_DRIVER         json oder postgres
  DATABASE_URL           PostgreSQL Verbindung

Beispiel:

    DATABASE_URL=postgres://bookingbot:password@postgres:5432/bookingbot

------------------------------------------------------------------------

# Migration JSON → PostgreSQL

Falls ältere Daten existieren:

    scripts/migrate-json-to-postgres.js

Ausführen:

    docker exec -it <bot_container> node scripts/migrate-json-to-postgres.js

------------------------------------------------------------------------

# Backup

Backups können mit `pg_dump` erstellt werden.

Beispiel:

    pg_dump bookingbot | gzip > bookingbot_backup.sql.gz

Restore:

    gunzip -c backup.sql.gz | psql bookingbot

------------------------------------------------------------------------

# CI/CD

GitHub Actions baut automatisch Docker Images.

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
-   eigener Docker Stack

------------------------------------------------------------------------

# Wartung

## Logs

    docker service logs lancampus-booking-bot_bot

## Container prüfen

    docker service ps lancampus-booking-bot_bot

------------------------------------------------------------------------

# Lizenz

Private Project -- LanCampus
