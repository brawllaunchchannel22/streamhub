import json
import os

# 1. Erstelle/Update package.json für den Builder
pkg_data = {
  "name": "streamhub-ultimate",
  "version": "1.0.0",
  "description": "StreamHub Ultimate - Mediathek Player",
  "main": "main.js",
  "author": "Dein Name",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --linux deb"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  },
  "build": {
    "appId": "com.streamhub.ultimate",
    "productName": "StreamHub",
    "linux": {
      "target": ["deb"],
      "category": "Video",
      "icon": "assets/icon.png"
    },
    "files": [
      "**/*",
      "!dist/*",
      "!node_modules/*/.cache"
    ]
  }
}

with open('package.json', 'w', encoding='utf-8') as f:
    json.dump(pkg_data, f, indent=2)

print("✅ package.json wurde für den Bau vorbereitet.")

# 2. Erstelle Ordner assets und ein Dummy-Icon (falls keins da ist)
if not os.path.exists('assets'):
    os.makedirs('assets')

icon_path = os.path.join('assets', 'icon.png')
if not os.path.exists(icon_path):
    # Erstelle ein einfaches 512x512 transparentes PNG als Platzhalter
    # (Damit der Builder nicht abstürzt)
    import base64
    # Ein einfaches blaues Quadrat als Icon (Base64 encoded)
    dummy_icon = b'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAAABGdBTUEAALGPC/xhBQAAAFBMVEUAAAAyPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv8yPv999kSNAAAAGnRSTlMAQDMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM8BO0z0AAAJKSURBVHja7dzhUQIBEARRQlJQkRkFVP9tsSPwMdD9gZvbO/v2fP/+AAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBD4FfgA1jwd1S82F/AAAAABJRU5ErkJggg=='
    with open(icon_path, 'wb') as f:
        f.write(base64.b64decode(dummy_icon))
    print("✅ Dummy-Icon in assets/icon.png erstellt.")
else:
    print("ℹ️ Icon bereits vorhanden.")

print("\n------------------------------------------------")
print("FERTIG! Führe jetzt folgende Befehle im Terminal aus:")
print("1. npm install")
print("2. npm run dist")
print("------------------------------------------------")
print("Deine .deb Datei liegt danach im Ordner 'dist'!")
