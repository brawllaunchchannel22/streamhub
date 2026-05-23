#!/bin/bash

echo "========================================="
echo "     StreamHub v2.0 Installation"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js ist nicht installiert!${NC}"
    echo ""
    echo "Installiere Node.js mit:"
    echo "  sudo apt update && sudo apt install nodejs npm -y"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)

echo -e "${GREEN}✓ Node.js gefunden: $NODE_VERSION${NC}"
echo -e "${GREEN}✓ NPM gefunden: $NPM_VERSION${NC}"
echo ""

# Clean old installation
echo -e "${BLUE}🧹 Räume alte Installation auf...${NC}"
rm -rf node_modules package-lock.json
echo ""

# Install dependencies
echo -e "${BLUE}📦 Installiere Abhängigkeiten...${NC}"
npm install

echo ""

# Check if successful
if [ -d "node_modules/electron" ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}✅ Installation erfolgreich!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "${YELLOW}Starte StreamHub mit:${NC}"
    echo "  npm start"
    echo ""
    echo -e "${YELLOW}Oder falls das nicht funktioniert:${NC}"
    echo "  npx electron ."
    echo ""
    echo -e "${YELLOW}Für Debug-Modus:${NC}"
    echo "  npm run dev"
    echo ""
    echo -e "${YELLOW}Build erstellen:${NC}"
    echo "  npm run build          # .deb und .AppImage"
    echo "  npm run build:deb      # nur .deb"
    echo "  npm run build:appimage # nur .AppImage"
    echo ""
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}❌ Installation fehlgeschlagen!${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "Versuche es manuell:"
    echo "  npm install electron --save-dev"
    echo ""
    exit 1
fi
