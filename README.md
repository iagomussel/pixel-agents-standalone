# Pixel Agents Standalone

Standalone web app that visualizes your AI coding sessions as pixel art characters in a virtual office. Each session (Claude, Codex, OpenCode, or Gemini) becomes a character that walks around, sits at a desk, and reflects what it's doing — writing code, running tools, waiting for approval, or idle.

![Screenshot](webview-ui/public/Screenshot.jpg)

Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) (VS Code extension by Pablo De Lucca, MIT). This project is a separate implementation: same concept, different stack — runs in the browser with no VS Code.

## Supported agents

| Provider   | Watched directory           | Launch from UI |
|-----------|-----------------------------|----------------|
| Claude    | `~/.claude/projects/`       | Yes            |
| Codex     | `~/.codex/sessions/`        | Yes            |
| Gemini    | `~/.gemini/sessions/`       | Yes            |
| OpenCode  | (resume only)               | Yes            |

Sessions are detected automatically from JSONL transcripts. You can launch any provider from the app into a chosen workspace folder.

---

## Features

### Agents and sessions

- **Multi-provider** — Claude, Codex, OpenCode, Gemini in one office view.
- **Launch agents** — "+ Agent" or "+ NEW PROJECT" (Board): pick provider and workspace folder.
- **Resume in terminal** — Per-agent panel shows the resume command; copy and run in your terminal.
- **Focus agent** — Click a character to open its panel; focus action for terminal integration.
- **Lay off** — Remove an agent from the office view (persisted); they reappear when the session is active again.
- **Close agent** — From Debug view, request to close a session (UI; actual close depends on provider).

### Interaction

- **Chat with agents** — Send prompts from the agent panel. Slash commands (e.g. `/compact`) are supported where the provider allows.
- **Approve / deny** — When an agent is waiting for permission, Approve or Deny from the panel or from the auto-shown permission bubble.
- **Rename agents** — Custom names per agent; persisted in `~/.pixel-agents/agent-names.json`.
- **Token usage** — Per-agent input/output token counts; total tokens in the system header.

### Office and layout

- **Office editor** — Toggle with "Layout" or press **E**. Edit the office map and furniture.
  - **Tools**: Select, Tile paint, Wall paint, Furniture place, Furniture pick, Eyedropper, Erase.
  - **Tile types**: Wall and multiple floor types (conference, main, break, doorway, entry, offices, etc.).
  - **Floor/wall colors** — Hue, saturation, brightness, contrast; optional colorize mode.
  - **Furniture** — Desks, chairs, plants, lamps, PCs, etc.; categories (desks, chairs, decor, etc.). Rotate with **R**, delete with Delete/Backspace.
  - **Undo / Redo** — Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z). Save and Reset in the edit bar.
- **Export / Import layout** — Settings > Export Layout (downloads JSON), Import Layout (upload JSON). API: `GET /api/layout`, `POST /api/layout`.
- **Exterior** — Outdoor area around the office (road, sidewalk, grass, trees, cars, etc.) with optional assets.
- **Zoom and pan** — Zoom controls (buttons or scroll); click-drag to pan. Shortcut **?** for keyboard reference.

### Panels and UI

- **System header** — System health (ONLINE/IDLE), agent count, uptime, total tokens.
- **Agent panel (click character)** — Status, working dir, resume command (copy), Approve/Deny, Lay off, Context tab (objective/latest reply), Events tab (conversation + messages), send message input.
- **Project Board** — "Board" button. Groups agents by project (folder); focus or lay off per agent; "+ NEW PROJECT" to launch a new agent.
- **System Log** — "Log" button. Event stream: mission started/complete, layoff, tool start/done, approval needed, standby, subtask events.
- **Debug View** — Settings > Debug View. List of agents with role (CODING/READING/RESEARCH/COMMAND/ANALYSIS), status, context snapshot; focus, close, send message, permission, lay off.
- **Settings** — Open Sessions Folder, Export/Import Layout, Sound Notifications toggle, Debug View toggle.
- **Shortcuts** — **?** opens keyboard shortcuts (zoom, pan, E edit, R rotate, Delete, Undo, Redo, Escape).
- **Connection indicator** — Red dot when disconnected from the server; reconnects automatically.

### Subagents and tools

- **Subagent bubbles** — When an agent runs Task/Agent tools, subagents appear with their own status; approval applies to the parent.
- **Tool status** — Per-tool labels (e.g. "Reading file", "Running: npm test", "Waiting for your answer"); permission state shown in the UI.

### Content and assets

- **Sprite generation** — In Layout editor: generate pixel art sprites via Gemini (`POST /api/generate-sprite`). Set `GEMINI_API_KEY` in the environment.
- **PNG import** — In Layout editor: add custom furniture from PNG files (footprint and category).
- **Office tileset** — Optional [Office Interior Tileset](https://donarg.itch.io/office-interior-tileset-16x16) (Donarg); run `npm run extract-furniture` after placing the asset.
- **Character sprites** — Loaded from `webview-ui/public/assets/`; wall/floor/furniture assets configurable.

### Persistence and API

- **Persisted state** (`~/.pixel-agents/`) — `layout.json`, `agent-seats.json`, `agent-names.json`, `laid-off-agents.json`.
- **Health** — `GET /health` returns status, agent count, client count, uptime.
- **Idle shutdown** — Server exits after 10 minutes with no agents and no connected clients.

---

## Quick start

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build
npm start
```

Open `http://localhost:3456`. The server watches the session directories and shows agents in real time.

## Auto-launch (optional)

To start the server when an AI coding session begins (e.g. Claude Code), use a `SessionStart` hook. Example in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "/path/to/pixel-agents-standalone/scripts/cmux-hook.sh"
      }
    ]
  }
}
```

Set `PIXEL_AGENTS_DIR` in `scripts/cmux-hook.sh` to the path where you cloned this repo.

## Development

```bash
npm run dev
```

Runs the Express server (hot reload) and Vite dev server together.

## Scripts

| Script               | Description                                      |
|----------------------|--------------------------------------------------|
| `npm run dev`        | Server + UI dev mode                             |
| `npm run build`      | Build server and UI                              |
| `npm start`          | Run production server                             |
| `npm run extract-furniture` | Extract furniture from Office Interior Tileset  |
| `npm run import-tileset`    | Import tileset assets                           |

## Architecture

- **Server** (`server/`) — Express + WebSocket. Serves UI, layout export/import, sprite generation; handles launch, chat, permission, compact, seats/names/layoff persistence; health and idle shutdown.
- **Watcher** — Monitors `~/.claude/projects/`, `~/.codex/sessions/`, `~/.gemini/sessions/` for JSONL session files (chokidar).
- **Parser** — Claude-style and Codex-style JSONL: tool use, subagent progress, permission, token counts, conversation history, working dir.
- **UI** (`webview-ui/`) — React + Canvas 2D: pathfinding, sprite animation, office + exterior renderer, layout editor (tile/furniture/color), zoom/pan, agent panels, project board, system log, debug view, settings, shortcuts.

## Office tileset

The default layout uses built-in furniture. For the full 452-piece catalog, get the [Office Interior Tileset](https://donarg.itch.io/office-interior-tileset-16x16) by Donarg ($2), place it at `assets/office_tileset_16x16.png`, and run:

```bash
npm run extract-furniture
```

## Credits

- [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca — original VS Code extension (MIT)
- [Office Interior Tileset](https://donarg.itch.io/office-interior-tileset-16x16) by Donarg — pixel art furniture (paid)

## License

MIT
