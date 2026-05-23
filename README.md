# StreamHub 📺

StreamHub ist ein moderner, performanter und optisch ansprechender Mediathek-Client sowie IPTV-Player für deutsche öffentlich-rechtliche Fernsehsender. Das Programm läuft als Desktop-Applikation unter Linux + Android und bietet eine übersichtliche Oberfläche, um Sendungen zu durchstöbern, Live-Streams anzusehen oder lokale Videodateien zu verwalten.

![Version](https://img.shields.io/badge/Version-3.0.0-blue.svg?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Linux-orange.svg?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Android-3DDC84.svg?style=for-the-badge&logo=android&logoColor=white)

---

## ✨ Features

- 🔴 **Live TV:** Alle wichtigen Sender der ARD- und ZDF-Familie sowie die Dritten Programme in bester HLS-Streaming-Qualität.
- 🖼️ **Echte Thumbnails:** Automatisches Extrahieren von Vorschaubildern direkt aus den Video-Streams (mit intelligentem Cache-System).
- 🎬 **Serien-Gruppierung:** Intelligente Erkennung von Staffeln und Episoden zur übersichtlichen Bündelung von Serienformaten.
- 🍿 **TMDB-Anbindung:** Optionale Einbindung von TheMovieDB zur Anzeige offizieller Serien-Poster und Beschreibungen.
- 📁 **Lokale Ordner:** Verwaltung und Wiedergabe eigener lokaler Videoarchive mit integriertem Player (HLS/VOD) oder extern über VLC.
- 🎨 **Modernes UI:** Dunkles Glassmorphism-Design mit sanften Animationen und CSS-Glow-Effekten.

---

## 🛠️ Installation & Entwicklung

### Voraussetzungen
Stelle sicher, dass **Node.js** (v18+) und **npm** auf deinem Linux-System installiert sind.

1. **Repository klonen / herunterladen:**
   ```bash
   git clone https://github.com/brawllaunchchannel22/streamhub.git
   cd streamhub
   ```

2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

3. **Entwickler-Modus starten:**
   ```bash
   npm start
   ```

---

## 📦 Als Debian-Paket (.deb) paketieren

StreamHub nutzt `electron-builder`, um fertige Installationspakete zu generieren.

Um eine installierbare `.deb`-Datei für Ubuntu, Debian, Linux Mint oder Pop!_OS zu bauen, führe folgenden Befehl aus:

```bash
npm run build:deb
```

Die fertige `.deb`-Datei findest du anschließend im neu erstellten Ordner **`dist/`**. Du kannst sie wie folgt installieren:
```bash
sudo dpkg -i dist/streamhub_3.0.0_amd64.deb
# Falls Abhängigkeiten fehlen sollten:
sudo apt-get install -f
```

---

## ⚖️ Rechtlicher Hinweis

StreamHub greift auf öffentlich zugängliche Streams und die öffentliche API von MediathekViewWeb zu. Diese App ist ein inoffizieller Client und steht in keiner Verbindung mit den öffentlich-rechtlichen Rundfunkanstalten. Alle Rechte an den Inhalten und Streams verbleiben bei den jeweiligen Sendern.
