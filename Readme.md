# Lancampus Booking Bot

Ein produktiver **Discord-Bot** zur Anbindung eines **WordPress-Buchungssystems**.
Der Bot verwaltet Buchungen, Erinnerungen, Archivierung und Audit-Logs direkt in Discord.

## ✨ Features

* 📅 Anzeige & Verwaltung von Buchungen aus WordPress
* 🔔 Automatische Reminder (konfigurierbar, z.B. 7 & 1 Tag vorher)
* 🧾 Audit-Log-Channel für alle relevanten Aktionen
* 🗄️ Automatische Archivierung abgeschlossener Buchungen
* 🧹 Reinigungs-Checkliste mit Buttons & Dropdowns
* ❤️ Healthcheck-Endpunkt für Container-Orchestrierung
* 🐳 Betrieb in **Docker Swarm**
* 📦 Fertiges Image aus **GitHub Container Registry (GHCR)**

---

## 🏗️ Architektur (Kurzüberblick)

```
WordPress
   │  (Webhook + Shared Secret)
   ▼
Discord Booking Bot
   │
   ├─ Discord API (Channels, Buttons, Threads)
   ├─ Audit-Log Channel
   ├─ Archiv-Category
   └─ /data (persistenter State via Volume/NFS)
```

* **Runtime-Konfiguration** erfolgt ausschließlich über Environment-Variablen / Secrets
* **Keine Secrets im Repository**
* **Kein `npm install` zur Laufzeit**

---

## 🚀 Deployment (Docker Swarm)

### Image

```yaml
image: ghcr.io/mjlorne/lancampus-booking-bot:1.0.0
```

### Wichtige Environment-Variablen

```env
DISCORD_TOKEN=...
GUILD_ID=...
INTERNAL_CATEGORY_ID=...
ARCHIVE_CATEGORY_ID=...
AUDIT_CHANNEL_ID=...
WP_SHARED_SECRET=...

REMINDER_DAYS_BEFORE=7,1
REMINDER_CHECK_MINUTES=60
ARCHIVE_AFTER_DAYS=7

PORT=3000
TZ=Europe/Berlin
```

> ⚠️ **Secrets gehören nicht ins Repo**
> Empfohlen: Docker Swarm Secrets oder geschützte ENV-Konfiguration.

---

## 💾 Persistenz

Der Bot benötigt **schreibbaren persistenten Storage** für Laufzeitdaten:

```yaml
volumes:
  - /DockerData/lancampusbot/data:/code/data
```

* Enthält Status, Archiv-Informationen etc.
* Wird **nicht** versioniert (`.gitignore`)

---

## ❤️ Healthcheck

Der Bot stellt einen HTTP-Healthcheck bereit:

```
GET /healthz
```

Beispiel (Swarm):

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/healthz"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 60s
```

---

## 🔐 Sicherheit

* Keine Secrets im Git-Repository
* Runtime-Secrets nur via ENV / Swarm Secrets
* Audit-Log für alle kritischen Aktionen
* Optional: Read-only Root-FS & non-root Container-User

---

## 🧑‍💻 Entwicklung

```bash
npm install
node index.js
```

Lokale Entwicklung erfordert:

* Node.js ≥ 18
* Discord Bot Token
* Test-Server (Guild)

---

## 📦 Versionierung

* SemVer (`1.0.0`, `1.0.1`, …)
* Produktivbetrieb nutzt **fixe Image-Tags**
* Optional: Digest-Pinning (`@sha256:...`)

---

## 📄 Lizenz

Internes Projekt / private Nutzung.
Keine öffentliche Weitergabe ohne Freigabe.

---

## 📝 Hinweis

Dieses Repository enthält **nur Quellcode**.
Produktionsdaten, Tokens und Konfigurationsdateien liegen **ausschließlich außerhalb von Git**.
