<p align="center">
  <img src="https://img.shields.io/badge/Adobe-InDesign-FF3366?style=for-the-badge&logo=adobeindesign&logoColor=white" alt="InDesign">
  <img src="https://img.shields.io/badge/CEP-Extension-333333?style=for-the-badge" alt="CEP">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
</p>
<p align="center">
  <a href="https://buymeacoffee.com/kostiskounadis" target="_blank"><img src="https://img.shields.io/badge/Buy_Me_A_Beer-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy me a beer"></a>
</p>

# IntrixAI — AI Assistant for Adobe InDesign

**IntrixAI** is an advanced CEP panel that lives inside Adobe InDesign and acts as your AI scripting assistant, MCP engine, and script manager.

Works with **local AI models** (via [Ollama](https://ollama.com)), or cloud providers like **Google Gemini**, **OpenAI**, **Anthropic**, and any **OpenAI-compatible endpoint**.

## ✨ Features

### Core
- **Natural Language → ExtendScript**: Describe your task, get working code instantly.
- **Multi-Provider Support**: Ollama (local/private), Google Gemini, OpenAI, Anthropic, and Custom endpoints.
- **Code Preview & Safety**: All generated code is shown before execution; nothing runs without your approval.
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
2. Double-click `enable_debug_mode.command` to allow unsigned extensions.
3. Double-click `install_extension.command` (enter your password when prompted).

**Option B: Manual Install**
If you prefer not to use the `.command` scripts:
1. **Enable Debug Mode**: Open Terminal and run:
   ```bash
   defaults write com.adobe.CSXS.9 PlayerDebugMode 1
   defaults write com.adobe.CSXS.10 PlayerDebugMode 1
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   defaults write com.adobe.CSXS.12 PlayerDebugMode 1
   ```
2. **Create Extension Folder**: 
   ```bash
   sudo mkdir -p "/Library/Application Support/Adobe/CEP/extensions/com.aide.indesign"
   ```
3. **Copy Files**: Copy `CSXS`, `css`, `js`, `jsx`, and `index.html` from this repo into the folder created above.
4. **Fix Permissions**:
   ```bash
   sudo xattr -cr "/Library/Application Support/Adobe/CEP/extensions/com.aide.indesign"
   sudo chmod -R 755 "/Library/Application Support/Adobe/CEP/extensions/com.aide.indesign"
   ```

5. Restart InDesign and go to **Window → Extensions → Aide**.

### Installation (Windows)
1. Enable Debug Mode: Run `regedit`, go to `HKEY_CURRENT_USER\Software\Adobe\CSXS.10` (or your version), and set `PlayerDebugMode` to `1`.
2. Copy the folder to: `C:\Users\<User>\AppData\Roaming\Adobe\CEP\extensions\com.aide.indesign`
3. Restart InDesign and find it under **Window → Extensions**.

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
│   ├── models.js            # AI Provider management
│   ├── scripts.js           # Library management (Aide, Sets, Favs)
│   ├── system-prompt.js     # InDesign DOM reference for the AI
│   └── utils.js             # Code formatting & helpers
├── jsx/
│   └── host.jsx             # ExtendScript executor bridge
├── index.html               # Main UI shell
├── install_extension.command # macOS installer
├── enable_debug_mode.command # macOS debug enabler
├── LICENSE
└── README.md
```

## 🔒 Privacy & Security
- **Local-first**: When using Ollama, all processing stays on your machine.
- **API Security**: Keys are stored locally in your browser's `localStorage` and are never sent to third parties (only to the provider's API).
- **No Telemetry**: Aide does not collect data or "phone home."

## 📜 License
MIT — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Ollama](https://ollama.com) — Local AI model runtime
- [Adobe CEP Resources](https://github.com/Adobe-CEP/CEP-Resources) — CEP framework and CSInterface.js

Built with the help of AI coding assistants. Designed and directed by a graphic designer who got tired of doing repetitive InDesign tasks by hand.