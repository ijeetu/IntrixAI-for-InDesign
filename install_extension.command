#!/bin/bash
# install_extension.command
# Double-click to install IntrixAI for InDesign extension & auto-build InDesign MCP server.

cd "$(dirname "$0")"

SYSTEM_INTRIX_DIR="/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
USER_INTRIX_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
USER_AIDE_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.aide.indesign"
MCP_DIR="$(pwd)/adobe-indesign-mcp"

echo "========================================"
echo "  IntrixAI for InDesign — Installer"
echo "========================================"
echo ""

# --- Step 1: Remove previous installs ---
if [ -d "$SYSTEM_INTRIX_DIR" ]; then
    sudo rm -rf "$SYSTEM_INTRIX_DIR"
fi
if [ -d "$USER_INTRIX_DIR" ]; then
    rm -rf "$USER_INTRIX_DIR"
fi
if [ -d "$USER_AIDE_DIR" ]; then
    rm -rf "$USER_AIDE_DIR"
fi

# --- Step 2: Enable CEP debug mode ---
echo ""
echo "Enabling CEP debug mode..."
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
defaults write com.adobe.CSXS.14 PlayerDebugMode 1
defaults write com.adobe.CSXS.15 PlayerDebugMode 1
defaults write com.adobe.CSXS.16 PlayerDebugMode 1
echo "✓ Debug mode enabled for CSXS 9-16"

# --- Step 3: Auto-Install adobe-indesign-mcp Server ---
echo ""
echo "Checking InDesign MCP Server..."
if [ ! -f "$MCP_DIR/dist/index.js" ]; then
    echo "Installing adobe-indesign-mcp server..."
    git clone https://github.com/nutriandrea/adobe-indesign-mcp.git "$MCP_DIR"
    if [ -d "$MCP_DIR" ]; then
        cd "$MCP_DIR"
        npm install
        npm run build
        cd "$(dirname "$0")"
        echo "✓ InDesign MCP server installed & compiled."
    fi
else
    echo "✓ InDesign MCP server is already installed."
fi

# --- Step 4: Install CEP Extension to both user & system paths ---
echo ""
echo "Installing IntrixAI extension..."
mkdir -p "$USER_INTRIX_DIR"
mkdir -p "$USER_AIDE_DIR"
cp -R CSXS css js jsx index.html "$USER_INTRIX_DIR/"
cp -R CSXS css js jsx index.html "$USER_AIDE_DIR/"

sudo mkdir -p "$SYSTEM_INTRIX_DIR"
sudo cp -R CSXS css js jsx index.html "$SYSTEM_INTRIX_DIR/"

# Strip macOS quarantine/extended attributes
xattr -cr "$USER_INTRIX_DIR" "$USER_AIDE_DIR" 2>/dev/null || true
sudo xattr -cr "$SYSTEM_INTRIX_DIR" 2>/dev/null || true

# Match ownership
sudo chown -R root:wheel "$SYSTEM_INTRIX_DIR" 2>/dev/null || true
sudo chmod -R 755 "$SYSTEM_INTRIX_DIR" 2>/dev/null || true

# --- Step 5: Create .debug file ---
DEBUG_FILE="$HOME/Library/Application Support/Adobe/CEP/extensions/.debug"
cat > "/tmp/intrixai_debug" << 'DEBUGEOF'
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="com.intrixai.indesign.panel">
        <HostList>
            <Host Name="IDSN" Port="8099"/>
        </HostList>
    </Extension>
    <Extension Id="com.aide.indesign.panel">
        <HostList>
            <Host Name="IDSN" Port="8099"/>
        </HostList>
    </Extension>
</ExtensionList>
DEBUGEOF

if [ ! -f "$DEBUG_FILE" ]; then
    mkdir -p "$(dirname "$DEBUG_FILE")"
    cp "/tmp/intrixai_debug" "$DEBUG_FILE"
fi
rm -f "/tmp/intrixai_debug"

# --- Step 6: Verify ---
echo ""
if [ -f "$USER_INTRIX_DIR/CSXS/manifest.xml" ]; then
    echo "========================================"
    echo "✅ SUCCESS: IntrixAI & MCP Server Installed!"
    echo ""
    echo "Please FULLY QUIT (Cmd+Q) and restart"
    echo "Adobe InDesign, then go to:"
    echo "  Window > Extensions > IntrixAI"
    echo "========================================"
else
    echo "❌ ERROR: Installation failed."
fi
