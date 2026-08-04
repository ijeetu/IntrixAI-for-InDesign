#!/bin/bash
# =============================================================================
#  build_zxp.command — Aide for InDesign — ZXP Build & Sign Pipeline
#  Double-click to run on macOS.
#
#  WHAT THIS DOES:
#   1. Downloads Adobe's ZXPSignCmd binary (first run only).
#   2. Generates a self-signed signing certificate — build/aide_cert.p12
#      (first run only). Protects it with an auto-generated password stored
#      at build/.cert_password.
#   3. Reads the version from CSXS/manifest.xml (no hardcoding).
#   4. Stages a clean copy of the extension into a temp dist/ folder,
#      stripping macOS metadata (.DS_Store, __MACOSX) per Adobe's 2024
#      signing workaround.
#   5. Signs the staged folder into a .zxp file.
#   6. Drops the finished Aide-vX.X.X.zxp at the project root.
#
#  DISTRIBUTION:
#   The output .zxp is NOT uploaded anywhere by this script.
#   Recommend Anastasiy's Extension Manager to end users: https://install.anastasiy.com/
# =============================================================================

set -euo pipefail

# Change to the project root
cd "$(dirname "$0")"

# --- Colours -----------------------------------------------------------------
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[0;34m'
NC='\033[0m' # No Colour

echo ""
echo -e "${BLU}======================================================${NC}"
echo -e "${BLU}  Aide for InDesign — ZXP Build & Sign Pipeline      ${NC}"
echo -e "${BLU}======================================================${NC}"
echo ""

# =============================================================================
# CONFIG
# =============================================================================
BUILD_DIR="build"
ZXPSIGN="$BUILD_DIR/ZXPSignCmd"
CERT_FILE="$BUILD_DIR/aide_cert.p12"
PASS_FILE="$BUILD_DIR/.cert_password"

# ZXPSignCmd 4.1.2 — latest version with a macOS binary
ZXPSIGN_DMG_URL="https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.2/macOS/ZXPSignCmd-64bit.dmg"

# =============================================================================
# STEP 1 — Ensure build/ directory exists
# =============================================================================
mkdir -p "$BUILD_DIR"

# =============================================================================
# STEP 2 — Download & extract ZXPSignCmd from .dmg (first run only)
# =============================================================================
if [ ! -f "$ZXPSIGN" ]; then
    echo -e "${YLW}[First Run] Downloading ZXPSignCmd (macOS DMG)...${NC}"
    DMG_TMP="$BUILD_DIR/_zxpsign_tmp.dmg"
    MOUNT_POINT="$BUILD_DIR/_zxpsign_mount"

    if command -v curl &>/dev/null; then
        curl -fL "$ZXPSIGN_DMG_URL" -o "$DMG_TMP" --progress-bar
    else
        wget -q --show-progress "$ZXPSIGN_DMG_URL" -O "$DMG_TMP"
    fi

    mkdir -p "$MOUNT_POINT"
    hdiutil attach "$DMG_TMP" -mountpoint "$MOUNT_POINT" -nobrowse -quiet
    BINARY_SRC=$(find "$MOUNT_POINT" -name "ZXPSignCmd-64bit" -not -path "*.dSYM*" -type f | head -1)
    cp "$BINARY_SRC" "$ZXPSIGN"
    chmod +x "$ZXPSIGN"
    hdiutil detach "$MOUNT_POINT" -quiet
    rm -f "$DMG_TMP"
    rmdir "$MOUNT_POINT" 2>/dev/null || true
    echo -e "${GRN}  ✓ ZXPSignCmd extracted → $ZXPSIGN${NC}"
fi

# =============================================================================
# STEP 3 — Generate self-signed certificate using openssl (first run only)
# =============================================================================
if [ ! -f "$CERT_FILE" ]; then
    echo ""
    echo -e "${YLW}[First Run] Generating self-signed signing certificate (openssl)...${NC}"
    KEY_PEM="$BUILD_DIR/_aide_key.pem"
    CERT_PEM="$BUILD_DIR/_aide_cert.pem"
    CERT_PASS=$(openssl rand -hex 16)
    echo "$CERT_PASS" > "$PASS_FILE"
    chmod 600 "$PASS_FILE"

    openssl req -x509 -newkey rsa:2048 \
        -keyout "$KEY_PEM" \
        -out "$CERT_PEM" \
        -days 3650 \
        -nodes \
        -subj "/C=US/ST=CA/O=Aide/CN=Aide for InDesign" 2>&1 | sed 's/^/  /'

    openssl pkcs12 -export \
        -out "$CERT_FILE" \
        -inkey "$KEY_PEM" \
        -in "$CERT_PEM" \
        -passout "pass:$CERT_PASS" 2>&1 | sed 's/^/  /'
    rm -f "$KEY_PEM" "$CERT_PEM"
fi

CERT_PASS=$(cat "$PASS_FILE")

# =============================================================================
# STEP 4 — Read version from manifest
# =============================================================================
MANIFEST="CSXS/manifest.xml"
VERSION=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$MANIFEST" | grep -o '[0-9][^"]*')
ZXP_NAME="Aide-v${VERSION}.zxp"

echo ""
echo -e "  Version:    ${BLU}v${VERSION}${NC}"
echo -e "  Output:     ${BLU}${ZXP_NAME}${NC}"

# =============================================================================
# STEP 5 — Stage clean copy (temporary dist/ folder)
# =============================================================================
echo ""
echo "Staging clean copy..."
STAGE_DIR="dist"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp -R CSXS css js jsx scripts .agent .gemini index.html "$STAGE_DIR/"
find "$STAGE_DIR" -name ".DS_Store" -delete
find "$STAGE_DIR" -name "__MACOSX" -exec rm -rf {} + 2>/dev/null || true
find "$STAGE_DIR" -name "._*" -delete
echo -e "${GRN}  ✓ Staged and cleaned → $STAGE_DIR/${NC}"

# =============================================================================
# STEP 6 — Sign the extension
# =============================================================================
echo ""
echo "Signing..."
rm -f "$ZXP_NAME"
"$ZXPSIGN" -sign "$STAGE_DIR" "$ZXP_NAME" "$CERT_FILE" "$CERT_PASS" 2>&1 | sed 's/^/  /'

# =============================================================================
# STEP 7 — Verify output and clean up staging
# =============================================================================
rm -rf "$STAGE_DIR"
if [ ! -f "$ZXP_NAME" ] || [ ! -s "$ZXP_NAME" ]; then
    echo -e "${RED}  ❌ ERROR: Signing failed.${NC}"
    exit 1
fi
ZXP_SIZE=$(du -sh "$ZXP_NAME" | cut -f1)

# =============================================================================
# SUCCESS
# =============================================================================
echo ""
echo -e "${GRN}======================================================${NC}"
echo -e "${GRN}  ✅ SUCCESS: ${ZXP_NAME} (${ZXP_SIZE})${NC}"
echo -e "${GRN}======================================================${NC}"
echo ""
echo -e "  📦  ${YLW}Next steps (InDesign):${NC}"
echo "      1. Attach this .zxp to a GitHub Release or distribution page."
2. Direct users to install via Anastasiy's Extension Manager.
3. Once installed, launch InDesign and find Aide in Window > Extensions.
echo ""
echo "Press [Enter] to close..."
read -r
