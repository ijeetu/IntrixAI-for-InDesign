#!/bin/bash
# install_extension.command
# Double-click to install IntrixAI for InDesign extension & auto-build InDesign MCP server.

cd "$(dirname "$0")"

SYSTEM_INTRIX_DIR="/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
USER_INTRIX_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
USER_AIDE_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.aide.indesign"
DEFAULT_MCP_DIR="$HOME/Library/Application Support/IntrixAI/adobe-indesign-mcp"
LEGACY_MCP_DIR="$HOME/Desktop/Report/adobe-indesign-mcp"
if [ -f "$(pwd)/adobe-indesign-mcp/dist/index.js" ]; then
    MCP_DIR="$(pwd)/adobe-indesign-mcp"
elif [ -f "$LEGACY_MCP_DIR/dist/index.js" ]; then
    MCP_DIR="$LEGACY_MCP_DIR"
else
    MCP_DIR="$DEFAULT_MCP_DIR"
fi

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

# --- Step 2: Auto-Install adobe-indesign-mcp Server ---
echo ""
echo "Checking InDesign MCP Server..."
if [ ! -f "$MCP_DIR/dist/index.js" ]; then
    echo "Installing adobe-indesign-mcp server..."
    git clone https://github.com/ijeetu/adobe-indesign-mcp.git "$MCP_DIR"
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

# --- Step 3: Install one canonical user-scoped CEP extension ---
echo ""
echo "Installing IntrixAI extension..."
mkdir -p "$USER_INTRIX_DIR"
cp -R CSXS css js jsx scripts .agent .gemini index.html "$USER_INTRIX_DIR/"

# Strip macOS quarantine/extended attributes
xattr -cr "$USER_INTRIX_DIR" 2>/dev/null || true

# --- Step 4: Create a scoped .debug file (loads this extension unsigned
# without flipping the global CEP PlayerDebugMode registry setting) ---
DEBUG_FILE="$HOME/Library/Application Support/Adobe/CEP/extensions/.debug"
cat > "/tmp/intrixai_debug" << 'DEBUGEOF'
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="com.intrixai.indesign.panel">
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

# --- Step 5: Verify ---
echo ""
if [ -f "$USER_INTRIX_DIR/CSXS/manifest.xml" ]; then
    echo "========================================"
    echo "✅ SUCCESS: IntrixAI & MCP Server Installed!"
    echo ""
    echo "Please FULLY QUIT (Cmd+Q) and restart"
    echo "Adobe InDesign, then go to:"
    echo "  Window > Extensions > IntrixAI"
    echo ""
    echo "CLI Agent Mode is ready to go — no separate plugin to load."
    echo "The panel connects to the InDesign MCP bridge automatically"
    echo "whenever a CLI agent turn is running."
    echo "========================================"
else
    echo "❌ ERROR: Installation failed."
fi
