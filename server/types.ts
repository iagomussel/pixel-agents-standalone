// Agent activity states
export type AgentActivity = "idle" | "typing" | "reading" | "waiting" | "permission";
export type AgentSource = "claude" | "codex" | "opencode" | "gemini";
export type AgentConversationRole = "user" | "assistant";

// Tool info for speech bubbles
export interface ActiveTool {
  toolId: string;
  toolName: string;
  status: string;
}

export interface AgentConversationEntry {
  id: string;
  role: AgentConversationRole;
  text: string;
  timestamp: number;
}

// Agent as tracked by the server
export interface TrackedAgent {
  id: number;
  source: AgentSource;
  sessionId: string;
  projectDir: string;
  projectName: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activity: AgentActivity;
  activeTools: Map<string, ActiveTool>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  lastActivityTime: number;
  currentWorkingDir: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  conversationEntries: AgentConversationEntry[];
}

// Messages sent from server to client via WebSocket
// Must match the upstream message format expected by useExtensionMessages
export type ServerMessage =
  | { type: "agentCreated"; id: number; folderName: string; source?: AgentSource; resumeCommand?: string }
  | { type: "agentClosed"; id: number }
  | { type: "agentLaidOff"; id: number }
  | { type: "existingAgents"; agents: number[]; folderNames: Record<number, string>; agentMeta?: Record<number, { palette?: number; hueShift?: number; seatId?: string }>; agentSources?: Record<number, AgentSource>; agentResumeCommands?: Record<number, string> }
  | { type: "agentToolStart"; id: number; toolId: string; status: string }
  | { type: "agentToolDone"; id: number; toolId: string }
  | { type: "agentToolsClear"; id: number }
  | { type: "agentStatus"; id: number; status: string }
  | { type: "agentToolPermission"; id: number }
  | { type: "agentToolPermissionClear"; id: number }
  | { type: "subagentToolStart"; id: number; parentToolId: string; toolId: string; status: string }
  | { type: "subagentToolDone"; id: number; parentToolId: string; toolId: string }
  | { type: "subagentToolPermission"; id: number; parentToolId: string }
  | { type: "subagentClear"; id: number; parentToolId: string }
  | { type: "characterSpritesLoaded"; characters: unknown[] }
  | { type: "floorTilesLoaded"; sprites: unknown[] }
  | { type: "wallTilesLoaded"; sprites: unknown[] }
  | { type: "furnitureAssetsLoaded"; catalog: unknown[]; sprites: Record<string, unknown> }
  | { type: "layoutLoaded"; layout: unknown; version: number }
  | { type: "workspaceFolders"; folders: Array<{ name: string; path: string }> }
  | { type: "settingsLoaded"; soundEnabled: boolean }
  | { type: "agentNamesLoaded"; names: Record<number, string> }
  | { type: "agentWorkingDir"; id: number; dir: string }
  | { type: "agentTokenUsage"; id: number; inputTokens: number; outputTokens: number; totalInput: number; totalOutput: number }
  | { type: "agentConversationHistory"; id: number; entries: AgentConversationEntry[] };

// Messages sent from client to server
export type ClientMessage =
  | { type: "ready" }
  | { type: "webviewReady" }
  | { type: "saveLayout"; layout: unknown }
  | { type: "saveAgentSeats"; seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> }
  | { type: "saveAgentNames"; names: Record<number, string> }
  | { type: "userMessage"; agentId: number; text: string }
  | { type: "permissionAction"; agentId: number; action: "approve" | "deny" }
  | { type: "layoffAgent"; id: number }
  | { type: "openClaude"; folderPath?: string }
  | { type: "launchAgent"; provider: AgentSource; folderPath: string }
  | { type: "focusAgent"; id: number }
  | { type: "closeAgent"; id: number };
