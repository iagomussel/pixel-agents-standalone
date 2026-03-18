import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { JsonlWatcher, type WatchedFile } from "./watcher.js";
import { processTranscriptLine, clearAgentTimers } from "./parser.js";
import {
  loadCharacterSprites,
  loadWallTiles,
  loadFloorTiles,
  loadFurnitureAssets,
  loadDefaultLayout,
} from "./assetLoader.js";
import type { TrackedAgent, ServerMessage } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3456", 10);
const IDLE_SHUTDOWN_MS = 600_000; // 10 minutes

// State
const agents = new Map<string, TrackedAgent>(); // `${source}:${sessionId}` -> agent
let nextAgentId = 1;
const clients = new Set<WebSocket>();
let lastActivityTime = Date.now();

function collectWorkspaceFolders(): Array<{ name: string; path: string }> {
  const folders = new Map<string, { name: string; path: string }>();
  const cwd = process.cwd();
  folders.set(cwd, { name: "[Current Dir]", path: cwd });

  for (const agent of agents.values()) {
    if (isAgentLaidOff(agent)) continue;
    const dir = agent.currentWorkingDir ?? agent.projectDir;
    if (!dir || folders.has(dir)) continue;
    folders.set(dir, { name: agent.projectName || dir.split("/").pop() || dir, path: dir });
  }

  return Array.from(folders.values());
}

function getAgentKey(source: string, sessionId: string): string {
  return `${source}:${sessionId}`;
}

function findAgentById(id: number): TrackedAgent | null {
  for (const agent of agents.values()) {
    if (agent.id === id) return agent;
  }
  return null;
}

function getAgentCwd(agent: TrackedAgent): string {
  return agent.currentWorkingDir ?? process.cwd();
}

function quoteShellArg(value: string): string {
  return JSON.stringify(value);
}

function buildResumeCommand(agent: TrackedAgent): string | null {
  const sessionId = quoteShellArg(agent.sessionId);
  switch (agent.source) {
    case "claude":
      return `claude --resume ${sessionId}`;
    case "codex":
      return `codex resume ${sessionId}`;
    case "opencode":
      return `opencode run --session ${sessionId}`;
    default:
      return null;
  }
}

function spawnDetached(command: string, args: string[], cwd: string): void {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (err) => {
    console.error(`[Server] Failed to launch ${command}: ${err.message}`);
  });
  child.unref();
}

function sendPromptToAgent(agent: TrackedAgent, prompt: string): boolean {
  const cwd = getAgentCwd(agent);
  try {
    switch (agent.source) {
      case "claude":
        spawnDetached("claude", ["-p", "--resume", agent.sessionId, prompt], cwd);
        return true;
      case "codex":
        spawnDetached("codex", ["exec", "resume", "--json", "--skip-git-repo-check", agent.sessionId, prompt], cwd);
        return true;
      case "opencode":
        spawnDetached("opencode", ["run", "--session", agent.sessionId, "--format", "json", prompt], cwd);
        return true;
      default:
        console.warn(`[Server] Prompt dispatch not implemented for source: ${agent.source}`);
        return false;
    }
  } catch (err) {
    console.error(`[Server] Failed to send prompt to agent ${agent.id}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function handlePermissionAction(agent: TrackedAgent, action: "approve" | "deny"): boolean {
  const prompt = action === "approve"
    ? "The user approved the pending action. Continue."
    : "The user denied the pending action. Do not run that action. Explain briefly and choose a safer alternative.";
  return sendPromptToAgent(agent, prompt);
}

function compactContext(agent: TrackedAgent): boolean {
  const cwd = getAgentCwd(agent);
  try {
    switch (agent.source) {
      case "claude":
        // Claude CLI handles slash commands like /compact
        return sendPromptToAgent(agent, "/compact");
      case "codex":
        // Codex has a specific 'compact' command for sessions
        spawnDetached("codex", ["compact", "--json", agent.sessionId], cwd);
        return true;
      case "opencode":
        // OpenCode has a 'compact' command
        spawnDetached("opencode", ["compact", "--session", agent.sessionId], cwd);
        return true;
      default:
        return false;
    }
  } catch (err) {
    console.error(`[Server] Failed to compact agent ${agent.id}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// Load assets at startup
// In dev mode (tsx), __dirname is server/ so assets are at ../webview-ui/public/assets/
// In production (esbuild), __dirname is dist/ so assets are at ./public/assets/
const devAssetsRoot = join(__dirname, "..", "webview-ui", "public", "assets");
const prodAssetsRoot = join(__dirname, "public", "assets");
const assetsRoot = existsSync(devAssetsRoot) ? devAssetsRoot : prodAssetsRoot;

console.log(`[Server] Loading assets from: ${assetsRoot}`);

const characterSprites = loadCharacterSprites(assetsRoot);
const wallTiles = loadWallTiles(assetsRoot);
const floorTiles = loadFloorTiles(assetsRoot);
const furnitureAssets = loadFurnitureAssets(assetsRoot);

// Persistence directory
const persistDir = join(homedir(), ".pixel-agents");
const persistedLayoutPath = join(persistDir, "layout.json");
const persistedSeatsPath = join(persistDir, "agent-seats.json");
const persistedNamesPath = join(persistDir, "agent-names.json");
const persistedLaidOffAgentsPath = join(persistDir, "laid-off-agents.json");

// Load layout: persisted first, then default
function loadLayout(): Record<string, unknown> | null {
  if (existsSync(persistedLayoutPath)) {
    try {
      const content = readFileSync(persistedLayoutPath, "utf-8");
      const layout = JSON.parse(content) as Record<string, unknown>;
      console.log(`[Server] Loaded persisted layout from ${persistedLayoutPath}`);
      return layout;
    } catch (err) {
      console.warn(`[Server] Failed to load persisted layout: ${err instanceof Error ? err.message : err}`);
    }
  }
  return loadDefaultLayout(assetsRoot);
}

function loadPersistedSeats(): Record<number, { palette: number; hueShift: number; seatId: string | null }> | null {
  if (existsSync(persistedSeatsPath)) {
    try {
      const content = readFileSync(persistedSeatsPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

function loadPersistedNames(): Record<number, string> | null {
  if (existsSync(persistedNamesPath)) {
    try {
      const content = readFileSync(persistedNamesPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

function loadPersistedLaidOffAgents(): Set<string> {
  if (!existsSync(persistedLaidOffAgentsPath)) {
    return new Set();
  }

  try {
    const content = readFileSync(persistedLaidOffAgentsPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function persistLaidOffAgents(laidOffAgentKeys: Set<string>): void {
  mkdirSync(persistDir, { recursive: true });
  writeFileSync(persistedLaidOffAgentsPath, JSON.stringify(Array.from(laidOffAgentKeys).sort(), null, 2));
}

let currentLayout = loadLayout();
const persistedSeats = loadPersistedSeats();
const persistedNames = loadPersistedNames();
const laidOffAgentKeys = loadPersistedLaidOffAgents();

function isAgentLaidOff(agent: TrackedAgent): boolean {
  return laidOffAgentKeys.has(getAgentKey(agent.source, agent.sessionId));
}

// Express app
const app = express();
app.use(express.json({ limit: "5mb" }));
// Serve production build
app.use(express.static(join(__dirname, "public")));

// Health check
app.get("/health", (_req, res) => {
  const visibleAgents = Array.from(agents.values()).filter((agent) => !isAgentLaidOff(agent)).length;
  res.json({ status: "ok", agents: visibleAgents, clients: clients.size, uptime: Math.floor(process.uptime()) });
});

// Layout export
app.get("/api/layout", (_req, res) => {
  if (!currentLayout) {
    res.status(404).json({ error: "No layout saved yet" });
    return;
  }
  res.setHeader("Content-Disposition", "attachment; filename=pixel-agents-layout.json");
  res.json(currentLayout);
});

// Layout import
app.post("/api/layout", (req, res) => {
  const layout = req.body as Record<string, unknown>;
  if (!layout || typeof layout !== "object") {
    res.status(400).json({ error: "Invalid layout" });
    return;
  }
  try {
    mkdirSync(persistDir, { recursive: true });
    writeFileSync(persistedLayoutPath, JSON.stringify(layout, null, 2));
    currentLayout = layout;
    broadcast({ type: "layoutLoaded", layout, version: 1 });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[Server] Failed to import layout: ${err instanceof Error ? err.message : err}`);
    res.status(500).json({ error: "Failed to save layout" });
  }
});

// Sprite generation via Gemini
app.post("/api/generate-sprite", async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY not set" });
    return;
  }
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const fullPrompt = `Top-down pixel art sprite for a 2D office/room game, transparent background, 16-bit style. ${prompt}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: fullPrompt,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    } as Parameters<typeof ai.models.generateContent>[0]);
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);
    if (!imgPart?.inlineData) {
      res.status(500).json({ error: "No image returned from Gemini" });
      return;
    }
    res.json({ imageBase64: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType });
  } catch (err) {
    console.error(`[Server] Gemini error: ${err instanceof Error ? err.message : err}`);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

const server = createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

// Ping/pong heartbeat — keeps clients Set accurate for shutdown guard
const HEARTBEAT_INTERVAL_MS = 30_000;
setInterval(() => {
  for (const ws of clients) {
    if ((ws as unknown as Record<string, boolean>).__isAlive === false) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    (ws as unknown as Record<string, boolean>).__isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function sendInitialData(ws: WebSocket): void {
  ws.send(JSON.stringify({ type: "workspaceFolders", folders: collectWorkspaceFolders() }));

  // Send settings
  ws.send(JSON.stringify({ type: "settingsLoaded", soundEnabled: false }));

  // Send character sprites
  if (characterSprites) {
    ws.send(JSON.stringify({ type: "characterSpritesLoaded", characters: characterSprites.characters }));
  }

  // Send wall tiles
  if (wallTiles) {
    ws.send(JSON.stringify({ type: "wallTilesLoaded", sprites: wallTiles.sprites }));
  }

  // Send floor tiles (optional)
  if (floorTiles) {
    ws.send(JSON.stringify({ type: "floorTilesLoaded", sprites: floorTiles.sprites }));
  }

  // Send furniture assets (optional)
  if (furnitureAssets) {
    ws.send(
      JSON.stringify({
        type: "furnitureAssetsLoaded",
        catalog: furnitureAssets.catalog,
        sprites: furnitureAssets.sprites,
      }),
    );
  }

  // Send agent names
  if (persistedNames && Object.keys(persistedNames).length > 0) {
    ws.send(JSON.stringify({ type: "agentNamesLoaded", names: persistedNames }));
  }

  // Send existing agents with persisted seat metadata
  const agentList = Array.from(agents.values()).filter((agent) => !isAgentLaidOff(agent));
  const agentIds = agentList.map((a) => a.id);
  const folderNames: Record<number, string> = {};
  const agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }> = {};
  const agentSources: Record<number, TrackedAgent["source"]> = {};
  const agentResumeCommands: Record<number, string> = {};
  for (const a of agentList) {
    folderNames[a.id] = a.projectName;
    agentSources[a.id] = a.source;
    const resumeCommand = buildResumeCommand(a);
    if (resumeCommand) {
      agentResumeCommands[a.id] = resumeCommand;
    }
    if (persistedSeats?.[a.id]) {
      const s = persistedSeats[a.id];
      agentMeta[a.id] = { palette: s.palette, hueShift: s.hueShift, seatId: s.seatId ?? undefined };
    }
  }
  ws.send(JSON.stringify({ type: "existingAgents", agents: agentIds, folderNames, agentMeta, agentSources, agentResumeCommands }));

  // Send layout (must come after existingAgents — the hook buffers agents until layout arrives)
  if (currentLayout) {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: currentLayout, version: 1 }));
  } else {
    // Send null layout to trigger default layout creation in the UI
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: null, version: 0 }));
  }

  for (const agent of agentList) {
    if (agent.currentWorkingDir) {
      ws.send(JSON.stringify({ type: "agentWorkingDir", id: agent.id, dir: agent.currentWorkingDir }));
    }
    if (agent.totalInputTokens > 0 || agent.totalOutputTokens > 0) {
      ws.send(JSON.stringify({
        type: "agentTokenUsage",
        id: agent.id,
        inputTokens: 0,
        outputTokens: 0,
        totalInput: agent.totalInputTokens,
        totalOutput: agent.totalOutputTokens,
      }));
    }
    if (agent.conversationEntries.length > 0) {
      ws.send(JSON.stringify({ type: "agentConversationHistory", id: agent.id, entries: agent.conversationEntries }));
    }
  }
}

wss.on("connection", (ws) => {
  (ws as unknown as Record<string, boolean>).__isAlive = true;
  ws.on("pong", () => { (ws as unknown as Record<string, boolean>).__isAlive = true; });
  clients.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "webviewReady" || msg.type === "ready") {
        sendInitialData(ws);
      } else if (msg.type === "saveLayout") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedLayoutPath, JSON.stringify(msg.layout, null, 2));
          currentLayout = msg.layout as Record<string, unknown>;
          // Broadcast to other clients for multi-tab sync
          const data = JSON.stringify({ type: "layoutLoaded", layout: msg.layout, version: 1 });
          for (const client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          }
        } catch (err) {
          console.error(`[Server] Failed to save layout: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "saveAgentSeats") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedSeatsPath, JSON.stringify(msg.seats, null, 2));
        } catch (err) {
          console.error(`[Server] Failed to save agent seats: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "saveAgentNames") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedNamesPath, JSON.stringify(msg.names, null, 2));
        } catch (err) {
          console.error(`[Server] Failed to save agent names: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "layoffAgent") {
        const agent = findAgentById(msg.id);
        if (agent && !isAgentLaidOff(agent)) {
          const agentKey = getAgentKey(agent.source, agent.sessionId);
          laidOffAgentKeys.add(agentKey);
          persistLaidOffAgents(laidOffAgentKeys);
          clearAgentTimers(agent.id);
          agent.activeTools.clear();
          agent.activeToolNames.clear();
          agent.activeSubagentToolIds.clear();
          agent.activeSubagentToolNames.clear();
          agent.activity = "idle";
          agent.isWaiting = false;
          agent.permissionSent = false;
          agent.hadToolsInTurn = false;
          broadcast({ type: "agentLaidOff", id: agent.id });
          console.log(`Agent ${agent.id} laid off from office view: [${agent.source}] ${agent.projectName}`);
        }
      } else if (msg.type === "openClaude") {
        const folderPath = typeof msg.folderPath === "string" && msg.folderPath.trim() ? msg.folderPath.trim() : process.cwd();
        console.log(`[Server] Launching Claude in ${folderPath}`);
        spawnDetached("claude", ["-p", "Hello! I am ready to help in this pixel office."], folderPath);
      } else if (msg.type === "launchAgent") {
        const folderPath = typeof msg.folderPath === "string" && msg.folderPath.trim() ? msg.folderPath.trim() : process.cwd();
        console.log(`[Server] Launching ${msg.provider} in ${folderPath}`);
        switch (msg.provider) {
          case "claude":
            spawnDetached("claude", ["-p", "Hello! I am ready to help."], folderPath);
            break;
          case "codex":
            spawnDetached("codex", ["exec", "--json", "--skip-git-repo-check", "Hello!"], folderPath);
            break;
          case "opencode":
            spawnDetached("opencode", ["run", "--format", "json", "Hello!"], folderPath);
            break;
          default:
            console.warn(`[Server] Unknown provider: ${String(msg.provider)}`);
        }
      } else if (msg.type === "userMessage") {
        const agent = findAgentById(msg.agentId);
        if (agent && typeof msg.text === "string" && msg.text.trim()) {
          if (msg.text.trim() === "/compact") {
            compactContext(agent);
          } else {
            sendPromptToAgent(agent, msg.text.trim());
          }
        }
      } else if (msg.type === "permissionAction") {
        const agent = findAgentById(msg.agentId);
        if (agent && (msg.action === "approve" || msg.action === "deny")) {
          handlePermissionAction(agent, msg.action);
        }
      }
    } catch {
      /* ignore invalid messages */
    }
  });

  ws.on("close", () => clients.delete(ws));
});

// Watcher
const watcher = new JsonlWatcher();

watcher.on("fileAdded", (file: WatchedFile) => {
  const agentKey = getAgentKey(file.source, file.sessionId);
  if (agents.has(agentKey)) return;
  lastActivityTime = Date.now();

  const agent: TrackedAgent = {
    id: nextAgentId++,
    source: file.source,
    sessionId: file.sessionId,
    projectDir: file.projectDir,
    projectName: file.projectName,
    jsonlFile: file.path,
    fileOffset: 0,
    lineBuffer: "",
    activity: "idle",
    activeTools: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastActivityTime: Date.now(),
    currentWorkingDir: file.currentWorkingDir,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    conversationEntries: [],
  };

  agents.set(agentKey, agent);
  if (isAgentLaidOff(agent)) {
    console.log(`Agent ${agent.id} remains laid off: [${agent.source}] ${agent.projectName} (${file.sessionId.slice(0, 8)})`);
    return;
  }

  broadcast({
    type: "agentCreated",
    id: agent.id,
    folderName: agent.projectName,
    source: agent.source,
    resumeCommand: buildResumeCommand(agent) ?? undefined,
  });
  if (agent.currentWorkingDir) {
    broadcast({ type: "agentWorkingDir", id: agent.id, dir: agent.currentWorkingDir });
  }
  console.log(`Agent ${agent.id} joined: [${agent.source}] ${agent.projectName} (${file.sessionId.slice(0, 8)})`);
});

watcher.on("fileRemoved", (file: WatchedFile) => {
  const agentKey = getAgentKey(file.source, file.sessionId);
  const agent = agents.get(agentKey);
  if (!agent) return;

  clearAgentTimers(agent.id);
  agents.delete(agentKey);
  if (laidOffAgentKeys.delete(agentKey)) {
    persistLaidOffAgents(laidOffAgentKeys);
  } else {
    broadcast({ type: "agentClosed", id: agent.id });
  }
  console.log(`Agent ${agent.id} left: [${agent.source}] ${agent.projectName}`);
});

watcher.on("line", (file: WatchedFile, line: string) => {
  const agent = agents.get(getAgentKey(file.source, file.sessionId));
  if (!agent) return;
  if (isAgentLaidOff(agent)) return;
  lastActivityTime = Date.now();

  processTranscriptLine(line, agent, broadcast);
});

// Start
watcher.start();
server.listen(PORT, () => {
  console.log(`Pixel Agents server running at http://localhost:${PORT}`);
  console.log(`Watching Claude and Codex session directories for active agents...`);
});

// Idle shutdown
setInterval(() => {
  if (agents.size === 0 && clients.size === 0 && Date.now() - lastActivityTime > IDLE_SHUTDOWN_MS) {
    console.log("No active sessions or clients for 10 minutes, shutting down...");
    watcher.stop();
    server.close();
    process.exit(0);
  }
}, 30_000);

// Graceful shutdown
process.on("SIGINT", () => {
  watcher.stop();
  server.close();
  process.exit(0);
});
