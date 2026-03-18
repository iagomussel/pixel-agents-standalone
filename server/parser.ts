import * as path from "path";
import type { TrackedAgent, ServerMessage } from "./types.js";

const READING_TOOLS = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);
const PERMISSION_EXEMPT_TOOLS = new Set(["Task", "Agent", "AskUserQuestion"]);
const PERMISSION_TIMER_DELAY_MS = 7000;
const TEXT_IDLE_DELAY_MS = 5000;
const TOOL_DONE_DELAY_MS = 300;
const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;
const IDLE_ACTIVITY_TIMEOUT_MS = 120_000; // 2 min — long-running tools (builds, tests) need time
const MAX_CONVERSATION_ENTRIES = 24;

// Timer maps (module-level)
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const idleTimeoutTimers = new Map<number, ReturnType<typeof setTimeout>>();

function normalizeConversationText(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function extractTimestamp(record: Record<string, unknown>): number {
  const value = record.timestamp;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function emitConversationHistory(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  emit({
    type: "agentConversationHistory",
    id: agent.id,
    entries: agent.conversationEntries,
  });
}

function appendConversationEntry(
  agent: TrackedAgent,
  role: "user" | "assistant",
  text: string,
  timestamp: number,
  emit: (msg: ServerMessage) => void,
): void {
  const normalized = normalizeConversationText(text);
  if (!normalized) return;

  const lastEntry = agent.conversationEntries[agent.conversationEntries.length - 1];
  if (lastEntry && lastEntry.role === role && lastEntry.text === normalized) {
    return;
  }

  const id = `${role}-${timestamp}-${agent.conversationEntries.length}`;
  agent.conversationEntries = [...agent.conversationEntries, { id, role, text: normalized, timestamp }]
    .slice(-MAX_CONVERSATION_ENTRIES);
  emitConversationHistory(agent, emit);
}

function extractClaudeText(content: unknown): string[] {
  if (typeof content === "string") {
    const normalized = normalizeConversationText(content);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(content)) return [];

  return content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const typedBlock = block as Record<string, unknown>;
      if (typedBlock.type !== "text" || typeof typedBlock.text !== "string") {
        return [];
      }
      const normalized = normalizeConversationText(typedBlock.text);
      return normalized ? [normalized] : [];
    });
}

function extractCodexContentText(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const typedPart = part as Record<string, unknown>;
      const partType = typedPart.type;

      if ((partType === "input_text" || partType === "output_text" || partType === "text")
        && typeof typedPart.text === "string") {
        const normalized = normalizeConversationText(typedPart.text);
        return normalized ? [normalized] : [];
      }

      if (partType === "text" && typedPart.text && typeof typedPart.text === "object") {
        const nestedText = (typedPart.text as Record<string, unknown>).value;
        if (typeof nestedText === "string") {
          const normalized = normalizeConversationText(nestedText);
          return normalized ? [normalized] : [];
        }
      }

      if (typeof typedPart.content === "string") {
        const normalized = normalizeConversationText(typedPart.content);
        return normalized ? [normalized] : [];
      }

      return [];
    });
}

function extractWorkingDir(toolName: string, input: Record<string, unknown>): string | null {
  const filePath =
    (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') ? input.file_path as string | undefined :
    (toolName === 'Glob') ? input.path as string | undefined :
    (toolName === 'Grep') ? input.path as string | undefined :
    null;
  if (!filePath || typeof filePath !== 'string') return null;
  return path.dirname(filePath);
}

function extractUsageCounts(payload: Record<string, unknown>): { input: number; output: number } | null {
  const readNumber = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  };

  const input = readNumber("input_tokens", "inputTokens", "prompt_tokens", "promptTokens");
  const output = readNumber("output_tokens", "outputTokens", "completion_tokens", "completionTokens");
  if (input === null && output === null) return null;
  return { input: input ?? 0, output: output ?? 0 };
}

function emitTokenUsage(
  agent: TrackedAgent,
  counts: { input: number; output: number } | null,
  emit: (msg: ServerMessage) => void,
): void {
  if (!counts) return;
  if (counts.input === 0 && counts.output === 0) return;
  agent.totalInputTokens += counts.input;
  agent.totalOutputTokens += counts.output;
  emit({
    type: "agentTokenUsage",
    id: agent.id,
    inputTokens: counts.input,
    outputTokens: counts.output,
    totalInput: agent.totalInputTokens,
    totalOutput: agent.totalOutputTokens,
  });
}

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === "string" ? path.basename(p) : "");
  switch (toolName) {
    case "Read":
      return `Reading ${base(input.file_path)}`;
    case "Edit":
      return `Editing ${base(input.file_path)}`;
    case "Write":
      return `Writing ${base(input.file_path)}`;
    case "Bash": {
      const cmd = (input.command as string) || "";
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + "\u2026" : cmd}`;
    }
    case "Glob":
      return "Searching files";
    case "Grep":
      return "Searching code";
    case "WebFetch":
      return "Fetching web content";
    case "WebSearch":
      return "Searching the web";
    case "Task":
    case "Agent": {
      const desc = typeof input.description === "string" ? input.description : "";
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + "\u2026" : desc}`
        : "Running subtask";
    }
    case "AskUserQuestion":
      return "Waiting for your answer";
    case "EnterPlanMode":
      return "Planning";
    case "NotebookEdit":
      return "Editing notebook";
    default:
      return `Using ${toolName}`;
  }
}

function formatCodexToolStatus(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "exec_command": {
      const cmd = (input.cmd as string) || "";
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? `${cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH)}\u2026` : cmd}`;
    }
    case "write_stdin":
      return "Running terminal input";
    case "apply_patch":
      return "Editing code";
    case "update_plan":
      return "Planning";
    case "parallel": {
      const toolUses = Array.isArray(input.tool_uses) ? input.tool_uses.length : 0;
      return toolUses > 0 ? `Running ${toolUses} tools in parallel` : "Running parallel tools";
    }
    default:
      return `Using ${toolName}`;
  }
}

function extractCodexWorkingDir(
  toolName: string,
  input: Record<string, unknown>,
  agent: TrackedAgent,
): string | null {
  if (toolName === "exec_command" && typeof input.workdir === "string" && input.workdir) {
    return input.workdir;
  }
  return agent.currentWorkingDir;
}

function markAgentActive(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
  activity: TrackedAgent["activity"],
): void {
  cancelTimer(agent.id, waitingTimers);
  agent.isWaiting = false;
  agent.activity = activity;
  agent.lastActivityTime = Date.now();
  emit({ type: "agentStatus", id: agent.id, status: "active" });
}

function setAgentWorkingDir(
  agent: TrackedAgent,
  dir: string | null,
  emit: (msg: ServerMessage) => void,
): void {
  if (!dir || dir === "." || dir === agent.currentWorkingDir) return;
  agent.currentWorkingDir = dir;
  agent.projectDir = dir;
  emit({ type: "agentWorkingDir", id: agent.id, dir });
}

function cancelTimer(agentId: number, timers: Map<number, ReturnType<typeof setTimeout>>): void {
  const t = timers.get(agentId);
  if (t) {
    clearTimeout(t);
    timers.delete(agentId);
  }
}

function startWaitingTimer(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, waitingTimers);
  waitingTimers.set(
    agent.id,
    setTimeout(() => {
      waitingTimers.delete(agent.id);
      agent.isWaiting = true;
      agent.hadToolsInTurn = false;
      emit({ type: "agentStatus", id: agent.id, status: "waiting" });
    }, TEXT_IDLE_DELAY_MS),
  );
}

function startIdleTimeout(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, idleTimeoutTimers);
  idleTimeoutTimers.set(
    agent.id,
    setTimeout(() => {
      idleTimeoutTimers.delete(agent.id);
      if (agent.activity !== "idle" && agent.activity !== "waiting") {
        clearAgentActivity(agent, emit);
        agent.isWaiting = true;
        agent.hadToolsInTurn = false;
        agent.activity = "waiting";
        emit({ type: "agentStatus", id: agent.id, status: "waiting" });
      }
    }, IDLE_ACTIVITY_TIMEOUT_MS),
  );
}

function startPermissionTimer(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, permissionTimers);
  permissionTimers.set(
    agent.id,
    setTimeout(() => {
      permissionTimers.delete(agent.id);
      // Check if there are still active non-exempt tools
      let hasNonExempt = false;
      for (const [, toolName] of agent.activeToolNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExempt = true;
          break;
        }
      }
      if (!hasNonExempt) {
        // Also check subagent tools
        for (const [, subNames] of agent.activeSubagentToolNames) {
          for (const [, toolName] of subNames) {
            if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
              hasNonExempt = true;
              break;
            }
          }
          if (hasNonExempt) break;
        }
      }
      if (hasNonExempt && !agent.permissionSent) {
        agent.permissionSent = true;
        emit({ type: "agentToolPermission", id: agent.id });
      }
    }, PERMISSION_TIMER_DELAY_MS),
  );
}

export function clearAgentTimers(agentId: number): void {
  cancelTimer(agentId, waitingTimers);
  cancelTimer(agentId, permissionTimers);
  cancelTimer(agentId, idleTimeoutTimers);
}

export function processTranscriptLine(
  line: string,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  if (agent.source === "codex") {
    processCodexTranscriptRecord(record, agent, emit);
    return;
  }

  const type = record.type as string;

  if (type === "assistant") {
    handleAssistantMessage(record, agent, emit);
  } else if (type === "user") {
    handleUserMessage(record, agent, emit);
  } else if (type === "system") {
    handleSystemMessage(record, agent, emit);
  } else if (type === "progress") {
    handleProgressMessage(record, agent, emit);
  }
}

function handleAssistantMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const message = record.message as Record<string, unknown> | undefined;
  if (message) {
    emitTokenUsage(agent, extractUsageCounts(message), emit);
  }
  if (!message?.content) return;

  const content = message.content as Array<Record<string, unknown>>;
  if (!Array.isArray(content)) return;
  const timestamp = extractTimestamp(record);
  const textBlocks = extractClaudeText(content);
  if (textBlocks.length > 0) {
    appendConversationEntry(agent, "assistant", textBlocks.join("\n\n"), timestamp, emit);
  }

  const hasToolUse = content.some((b) => b.type === "tool_use");

  if (hasToolUse) {
    markAgentActive(agent, emit, "typing");
    agent.hadToolsInTurn = true;

    let hasNonExemptTool = false;
    for (const block of content) {
      if (block.type === "tool_use" && block.id) {
        const toolId = block.id as string;
        const toolName = (block.name as string) || "";
        const input = (block.input as Record<string, unknown>) || {};
        const status = formatToolStatus(toolName, input);

        agent.activeTools.set(toolId, { toolId, toolName, status });
        agent.activeToolNames.set(toolId, toolName);
        agent.lastActivityTime = Date.now();

        const activity = READING_TOOLS.has(toolName) ? "reading" : "typing";
        agent.activity = activity;

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptTool = true;
        }

        emit({ type: "agentToolStart", id: agent.id, toolId, status });

        const dir = extractWorkingDir(toolName, input);
        setAgentWorkingDir(agent, dir, emit);
      }
    }
    if (hasNonExemptTool) {
      agent.permissionSent = false;
      startPermissionTimer(agent, emit);
    }
    startIdleTimeout(agent, emit);
  } else if (content.some((b) => b.type === "text") && !agent.hadToolsInTurn) {
    // Text-only response — use silence-based idle detection
    startWaitingTimer(agent, emit);
  }
}

function processCodexTranscriptRecord(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const type = record.type as string;

  if (type === "session_meta") {
    const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
    const cwd = typeof payload.cwd === "string" ? payload.cwd : null;
    if (cwd) {
      agent.projectDir = cwd;
      agent.projectName = path.basename(cwd) || agent.projectName;
    }
    setAgentWorkingDir(agent, cwd, emit);
    return;
  }

  if (type === "turn_context") {
    const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
    const cwd = typeof payload.cwd === "string" ? payload.cwd : null;
    setAgentWorkingDir(agent, cwd, emit);
    return;
  }

  if (type === "event_msg") {
    handleCodexEventMessage(record, agent, emit);
    return;
  }

  if (type === "response_item") {
    handleCodexResponseItem(record, agent, emit);
  }
}

function handleCodexEventMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
  const payloadType = payload.type as string | undefined;

  if (payloadType === "user_message") {
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, idleTimeoutTimers);
    clearAgentActivity(agent, emit);
    agent.hadToolsInTurn = false;
    return;
  }

  if (payloadType === "agent_message" || payloadType === "agent_reasoning") {
    markAgentActive(agent, emit, "typing");
    startIdleTimeout(agent, emit);
    return;
  }

  if (payloadType === "token_count") {
    emitTokenUsage(agent, extractUsageCounts(payload), emit);
  }

  if (payloadType === "token_count" && agent.activeTools.size === 0) {
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, permissionTimers);
    cancelTimer(agent.id, idleTimeoutTimers);
    agent.isWaiting = true;
    agent.permissionSent = false;
    agent.hadToolsInTurn = false;
    agent.activity = "waiting";
    emit({ type: "agentStatus", id: agent.id, status: "waiting" });
  }
}

function handleCodexResponseItem(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const payload = (record.payload as Record<string, unknown> | undefined) ?? {};
  const payloadType = payload.type as string | undefined;

  if (payloadType === "function_call") {
    const toolId = typeof payload.call_id === "string" ? payload.call_id : null;
    const toolName = typeof payload.name === "string" ? payload.name : "";
    if (!toolId || !toolName) return;

    let input: Record<string, unknown> = {};
    if (typeof payload.arguments === "string") {
      try {
        const parsed = JSON.parse(payload.arguments) as unknown;
        if (parsed && typeof parsed === "object") {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        input = {};
      }
    }

    const status = formatCodexToolStatus(toolName, input);
    agent.activeTools.set(toolId, { toolId, toolName, status });
    agent.activeToolNames.set(toolId, toolName);
    agent.hadToolsInTurn = true;

    const activity = toolName === "apply_patch" ? "typing" : toolName === "exec_command" ? "reading" : "typing";
    markAgentActive(agent, emit, activity);
    emit({ type: "agentToolStart", id: agent.id, toolId, status });

    const dir = extractCodexWorkingDir(toolName, input, agent);
    setAgentWorkingDir(agent, dir, emit);
    startIdleTimeout(agent, emit);
    return;
  }

  if (payloadType === "function_call_output") {
    const toolId = typeof payload.call_id === "string" ? payload.call_id : null;
    if (!toolId) return;

    agent.activeTools.delete(toolId);
    agent.activeToolNames.delete(toolId);

    setTimeout(() => {
      emit({ type: "agentToolDone", id: agent.id, toolId });
    }, TOOL_DONE_DELAY_MS);

    if (agent.activeTools.size === 0) {
      agent.hadToolsInTurn = false;
    }
    return;
  }

  if (payloadType === "message") {
    const role = payload.role as string | undefined;
    const textBlocks = extractCodexContentText(payload.content);
    if ((role === "user" || role === "assistant") && textBlocks.length > 0) {
      appendConversationEntry(agent, role, textBlocks.join("\n\n"), extractTimestamp(record), emit);
    }
    if (role === "user") {
      cancelTimer(agent.id, waitingTimers);
      cancelTimer(agent.id, idleTimeoutTimers);
      clearAgentActivity(agent, emit);
      agent.hadToolsInTurn = false;
      return;
    }
    if (role === "assistant") {
      markAgentActive(agent, emit, "typing");
      startIdleTimeout(agent, emit);
      return;
    }
  }

  if (payloadType === "reasoning") {
    markAgentActive(agent, emit, "typing");
    startIdleTimeout(agent, emit);
  }
}

function handleUserMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message?.content) return;

  const content = message.content;
  if (Array.isArray(content)) {
    const blocks = content as Array<Record<string, unknown>>;
    const hasToolResult = blocks.some((b) => b.type === "tool_result");

    if (hasToolResult) {
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const completedToolId = block.tool_use_id as string;

          // If completed tool was a Task/Agent, clear its subagent tools
          const completedToolName = agent.activeToolNames.get(completedToolId);
          if (completedToolName === "Task" || completedToolName === "Agent") {
            agent.activeSubagentToolIds.delete(completedToolId);
            agent.activeSubagentToolNames.delete(completedToolId);
            emit({
              type: "subagentClear",
              id: agent.id,
              parentToolId: completedToolId,
            });
          }

          agent.activeTools.delete(completedToolId);
          agent.activeToolNames.delete(completedToolId);

          // Delay the done message slightly (matches upstream)
          const toolId = completedToolId;
          setTimeout(() => {
            emit({ type: "agentToolDone", id: agent.id, toolId });
          }, TOOL_DONE_DELAY_MS);
        }
      }
      if (agent.activeTools.size === 0) {
        agent.hadToolsInTurn = false;
      }
    } else {
      const textBlocks = extractClaudeText(blocks);
      if (textBlocks.length > 0) {
        appendConversationEntry(agent, "user", textBlocks.join("\n\n"), extractTimestamp(record), emit);
      }
      // New user text prompt — new turn starting
      cancelTimer(agent.id, waitingTimers);
      cancelTimer(agent.id, idleTimeoutTimers);
      clearAgentActivity(agent, emit);
      agent.hadToolsInTurn = false;
    }
  } else if (typeof content === "string" && (content as string).trim()) {
    appendConversationEntry(agent, "user", content, extractTimestamp(record), emit);
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, idleTimeoutTimers);
    clearAgentActivity(agent, emit);
    agent.hadToolsInTurn = false;
  }
}

function handleSystemMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const subtype = record.subtype as string | undefined;

  if (subtype === "turn_duration") {
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, permissionTimers);
    cancelTimer(agent.id, idleTimeoutTimers);

    if (agent.activeTools.size > 0) {
      agent.activeTools.clear();
      agent.activeToolNames.clear();
      agent.activeSubagentToolIds.clear();
      agent.activeSubagentToolNames.clear();
      emit({ type: "agentToolsClear", id: agent.id });
    }

    agent.isWaiting = true;
    agent.permissionSent = false;
    agent.hadToolsInTurn = false;
    agent.activity = "waiting";
    emit({ type: "agentStatus", id: agent.id, status: "waiting" });
  }
}

function handleProgressMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  const dataType = data.type as string | undefined;

  // bash_progress / mcp_progress: restart permission timer
  if (dataType === "bash_progress" || dataType === "mcp_progress") {
    if (agent.activeTools.has(parentToolId)) {
      startPermissionTimer(agent, emit);
    }
    return;
  }

  // Only handle subagent progress for Task/Agent tools
  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (parentToolName !== "Task" && parentToolName !== "Agent") return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === "assistant") {
    let hasNonExemptSubTool = false;
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "tool_use" && block.id) {
        const toolId = block.id as string;
        const toolName = (block.name as string) || "";
        const input = (block.input as Record<string, unknown>) || {};
        const status = formatToolStatus(toolName, input);

        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(toolId);

        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(toolId, toolName);

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptSubTool = true;
        }

        emit({
          type: "subagentToolStart",
          id: agent.id,
          parentToolId,
          toolId,
          status,
        });
      }
    }
    if (hasNonExemptSubTool) {
      startPermissionTimer(agent, emit);
    }
  } else if (msgType === "user") {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "tool_result" && block.tool_use_id) {
        const toolId = block.tool_use_id as string;
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) subTools.delete(toolId);
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) subNames.delete(toolId);

        setTimeout(() => {
          emit({
            type: "subagentToolDone",
            id: agent.id,
            parentToolId,
            toolId,
          });
        }, TOOL_DONE_DELAY_MS);
      }
    }
  }
}

function clearAgentActivity(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, permissionTimers);
  cancelTimer(agent.id, idleTimeoutTimers);
  if (agent.activeTools.size > 0) {
    agent.activeTools.clear();
    agent.activeToolNames.clear();
    agent.activeSubagentToolIds.clear();
    agent.activeSubagentToolNames.clear();
    emit({ type: "agentToolsClear", id: agent.id });
  }
  if (agent.permissionSent) {
    agent.permissionSent = false;
    emit({ type: "agentToolPermissionClear", id: agent.id });
  }
  agent.activity = "idle";
}
