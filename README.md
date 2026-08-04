<p align="center">
  <img src="https://img.shields.io/badge/Adobe-InDesign-FF3366?style=for-the-badge&logo=adobeindesign&logoColor=white" alt="InDesign">
  <img src="https://img.shields.io/badge/CEP-Extension-333333?style=for-the-badge" alt="CEP">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
</p>
<p align="center">
  <a href="https://buymeacoffee.com/kostiskounadis" target="_blank"><img src="https://img.shields.io/badge/Buy_Me_A_Beer-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy me a beer"></a>
</p>

# IntrixAI — AI Assistant for Adobe InDesign

**IntrixAI** is an advanced CEP panel that lives inside Adobe InDesign and acts as a CLI design agent, AI scripting assistant, MCP bridge, and script manager.

Works with **local AI models** (via [Ollama](https://ollama.com)), or cloud providers like **Google Gemini**, **OpenAI**, **Anthropic**, and any **OpenAI-compatible endpoint**.

## ✨ Features

### Core
- **CLI Agent Mode**: Claude Code, Antigravity, Codex, and Gemini inspect, edit, and verify the live InDesign document with native MCP tool calls.
- **Agent-Owned MCP Lifecycle**: The selected CLI starts the installed InDesign MCP server; the CEP panel attaches to it over localhost WebSocket.
- **Natural Language → ExtendScript**: Describe your task, get working code instantly.
- **Multi-Provider Support**: Ollama (local/private), Google Gemini, OpenAI, Anthropic, and Custom endpoints.
- **Mode-Aware Safety**: CLI agents apply the requested live-document edits directly; API/local code-generation providers keep the existing code preview and Run approval flow.
- **Conversation Memory**: Context-aware follow-up prompts build on what was already created.
- **Auto-Fix on Error**: If a script errors, Aide can send the error message back to the AI to generate a fix.
- **Adaptive UI**: The panel follows InDesign's brightness theme (Light/Dark) automatically.

### Scripts Library
- **Aide tab**: Scripts saved from chat; search, star, and run.
- **Sets tab**: Organize your scripts into logical groups.
- **Favorites**: One-click access to your most-used automations.
- **Compact View**: Optimized for high-density script management.

## 📸 Screenshots

![Aide Chat](screenshots/Screenshot%202026-05-04%20at%2015.37.20.png)
*The Chat interface allows for natural language prompting and live ExtendScript generation with code preview.*

| | |
|:---:|:---:|
| ![Aide Scripts](screenshots/Screenshot%202026-05-04%20at%2015.37.51.png) | ![Aide Search](screenshots/Screenshot%202026-05-04%20at%2015.38.33.png) |
| The Scripts tab features a high-performance, IDE-like file tree for navigating local ExtendScript files and folders. | Real-time filtering and search enable quick access to specific scripts within complex directory structures. |
| ![Aide Sets](screenshots/Screenshot%202026-05-04%20at%2015.39.07.png) | ![Aide Settings](screenshots/Screenshot%202026-05-04%20at%2015.39.31.png) |
| Script Sets provide a way to organize frequently used scripts into logical collections for improved efficiency. | The Settings tab offers comprehensive control over LLM providers, model selection, and script folder indexing. |


## 🚀 Getting Started

### Requirements
- Adobe InDesign CC 2021 (v16.0) or later — (CEP 10, Chromium 88)
- Recommended: Adobe InDesign CC 2023+ (v18.0)
- macOS 10.15+ or Windows 10+
- For local AI: [Ollama](https://ollama.com) installed and running
- For cloud AI: An API key from your chosen provider

### Installation (macOS)
**Option A: Quick Install (Recommended)**
1. Download this repository.
2. Double-click `install_extension.command` (enter your password when prompted). This installs the CEP panel to a single user-scoped extension folder, and auto-installs/builds `adobe-indesign-mcp` if it isn't already on disk. It does **not** touch the global CEP `PlayerDebugMode` registry setting — the panel loads unsigned via a scoped `.debug` file instead.

**Option B: Manual Install**
If you prefer not to use the `.command` script:
1. **Create Extension Folder**:
   ```bash
   mkdir -p "$HOME/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
   ```
2. **Copy Files**: Copy `CSXS`, `css`, `js`, `jsx`, `scripts`, `index.html` (and `.agent`/`.gemini` if present) from this repo into the folder created above.
3. **Fix Permissions**:
   ```bash
   xattr -cr "$HOME/Library/Application Support/Adobe/CEP/extensions/com.intrixai.indesign"
   ```
4. **Scope debug loading to this extension only** — add a `.debug` file (see `install_extension.command` for the exact XML) rather than flipping the global `PlayerDebugMode` registry key for every CEP host on the machine.
5. Restart InDesign and go to **Window → Extensions → IntrixAI**.

### The InDesign MCP Bridge (CLI Agent Mode)
CLI agents (Claude Code, Antigravity, Codex, Gemini) never talk to InDesign directly — they call MCP tools on the `indesign-nutria-mcp` server over STDIO. That server relays ExtendScript execution to InDesign over a WebSocket at `ws://127.0.0.1:8120`. **`js/mcp-ws-bridge.js`**, loaded by the IntrixAI CEP panel itself, is what serves that WebSocket connection inside InDesign — no separate plugin or manual "Connect" step is required.

The panel starts trying to connect the moment it loads and keeps retrying every 800ms in the background. The MCP server itself is ephemeral — it's only spawned for the duration of a CLI agent turn — so the bridge indicator normally reads **"MCP: Waiting for agent turn…"** between messages and flips to **"MCP: Bridge connected"** while an agent turn is in flight. That's expected, not an error.

If the indicator instead reads **"MCP: Not installed"**, the InDesign MCP server itself couldn't be found on disk — re-run `install_extension.command`, or set `INDESIGN_MCP_SERVER` to its `dist/index.js` path.

### Installation (Windows)
1. Copy this repo's `CSXS`, `css`, `js`, `jsx`, `scripts`, `index.html` into: `C:\Users\<User>\AppData\Roaming\Adobe\CEP\extensions\com.intrixai.indesign`
2. Scope debug loading to this extension only by adding a `.debug` file at `C:\Users\<User>\AppData\Roaming\Adobe\CEP\extensions\.debug` listing `com.intrixai.indesign.panel` (see `install_extension.command` for the exact XML) — this avoids setting the global `PlayerDebugMode` registry key for every CEP host on the machine.
3. Restart InDesign and find it under **Window → Extensions → IntrixAI**.
4. For CLI Agent Mode, make sure the InDesign MCP server is installed (see "The InDesign MCP Bridge" above) — the panel connects to it automatically.

## 🛠 Project Structure

```text
Aide/
├── CSXS/
│   └── manifest.xml         # CEP extension registration
├── css/
│   └── style.css            # Adaptive theme & layout
├── js/
│   ├── CSInterface.js       # Adobe CEP library (Internal)
│   ├── app.js               # App logic, theme, & UI wiring
│   ├── chat.js              # Conversation engine
│   ├── agent-runtime.js     # Safe CLI process + MCP agent orchestration
│   ├── mcp-ws-bridge.js     # In-panel WebSocket client for the InDesign MCP bridge
│   ├── models.js            # AI Provider management
│   ├── scripts.js           # Library management (Aide, Sets, Favs)
│   ├── system-prompt.js     # InDesign DOM reference for the AI
│   └── utils.js             # Code formatting & helpers
├── jsx/
│   └── host.jsx             # ExtendScript executor bridge
├── index.html               # Main UI shell
├── scripts/
│   └── launch-indesign-mcp.mjs # Portable installed-server discovery/launcher
├── .agent/plugins/          # Antigravity workspace MCP plugin
├── .gemini/settings.json    # Gemini project MCP registration
├── install_extension.command # macOS installer
├── enable_debug_mode.command # macOS debug enabler
├── LICENSE
└── README.md
```

## 🔒 Privacy & Security
- **Local-first**: When using Ollama, all processing stays on your machine.
- **API Security**: Keys are stored locally in your browser's `localStorage` and are never sent to third parties (only to the provider's API).
- **No Telemetry**: Aide does not collect data or "phone home."
- **Scoped Agent Runs**: CLI prompts are passed as process arguments/stdin without shell interpolation. Claude is limited to the supplied MCP config, and Codex runs with a read-only filesystem sandbox.

## 📜 License
MIT — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Ollama](https://ollama.com) — Local AI model runtime
- [Adobe CEP Resources](https://github.com/Adobe-CEP/CEP-Resources) — CEP framework and CSInterface.js

Built with the help of AI coding assistants. Designed and directed by a graphic designer who got tired of doing repetitive InDesign tasks by hand.
