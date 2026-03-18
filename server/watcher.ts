import { watch } from "chokidar";
import { statSync, readdirSync, openSync, readSync, closeSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";
import type { AgentSource } from "./types.js";

const CLAUDE_PROJECTS_DIR = joinUnresolved(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR = joinUnresolved(homedir(), ".codex", "sessions");
const GEMINI_SESSIONS_DIR = joinUnresolved(homedir(), ".gemini", "sessions");
const INITIAL_SCAN_THRESHOLD_MS = 86_400_000; // 24 hours — include sessions from today
const POLL_INTERVAL_MS = 1000;
const WATCH_DEPTH = 5;

// Workaround for process.env.HOME vs homedir() inconsistencies in some setups
function joinUnresolved(base: string, ...parts: string[]): string {
  return join(base, ...parts);
}

const WATCH_ROOTS: Array<{ path: string; source: AgentSource; maxDepth: number }> = [
  { path: CLAUDE_PROJECTS_DIR, source: "claude", maxDepth: 2 },
  { path: CODEX_SESSIONS_DIR, source: "codex", maxDepth: 3 },
  { path: GEMINI_SESSIONS_DIR, source: "gemini", maxDepth: 2 },
];

export interface WatchedFile {
  path: string;
  source: AgentSource;
  sessionId: string;
  projectDir: string;
  projectName: string;
  currentWorkingDir: string | null;
  offset: number;
  lineBuffer: string;
}

export class JsonlWatcher extends EventEmitter {
  private files = new Map<string, WatchedFile>();
  private watcher: ReturnType<typeof watch> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.scanForActiveFiles();

    this.watcher = watch(WATCH_ROOTS.map((root) => root.path), {
      ignoreInitial: true,
      depth: WATCH_DEPTH,
    });

    this.watcher.on("add", (filePath: string) => {
      if (filePath.endsWith(".jsonl")) {
        this.addFile(filePath);
      }
    });

    this.pollInterval = setInterval(() => this.pollFiles(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private scanForActiveFiles(): void {
    for (const root of WATCH_ROOTS) {
      this.scanRoot(root.path, root.maxDepth);
    }
  }

  private addFile(filePath: string): void {
    if (this.files.has(filePath)) return;

    const source = this.getSource(filePath);
    if (!source) return;

    const metadata = (source === "claude" || source === "gemini")
      ? this.readClaudeMetadata(filePath)
      : this.readCodexMetadata(filePath);

    const file: WatchedFile = {
      path: filePath,
      source,
      sessionId: metadata.sessionId,
      projectDir: metadata.projectDir,
      projectName: metadata.projectName,
      currentWorkingDir: metadata.currentWorkingDir,
      offset: 0,
      lineBuffer: "",
    };

    this.files.set(filePath, file);
    this.emit("fileAdded", file);

    // Read existing content to catch up
    this.readNewLines(file);
  }

  private pollFiles(): void {
    for (const [path, file] of this.files) {
      try {
        const stat = statSync(path);
        if (stat.size > file.offset) {
          this.readNewLines(file);
        }
        // Only remove if file no longer exists (handled by catch below)
        // Time-based removal was removed: agents can be idle for hours waiting for input
      } catch {
        // File was deleted — remove the agent
        this.files.delete(path);
        this.emit("fileRemoved", file);
      }
    }
  }

  private readNewLines(file: WatchedFile): void {
    try {
      const stat = statSync(file.path);
      // Handle file truncation (e.g. log rotation)
      if (stat.size < file.offset) {
        file.offset = 0;
        file.lineBuffer = "";
      }
      if (stat.size <= file.offset) return;

      const buf = Buffer.alloc(stat.size - file.offset);
      const fd = openSync(file.path, "r");
      readSync(fd, buf, 0, buf.length, file.offset);
      closeSync(fd);

      file.offset = stat.size;
      const text = file.lineBuffer + buf.toString("utf-8");
      const lines = text.split("\n");

      // Last element is incomplete line (buffer it)
      file.lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          this.emit("line", file, line);
        }
      }
    } catch {
      /* file may have been deleted */
    }
  }

  getActiveFiles(): WatchedFile[] {
    return Array.from(this.files.values());
  }

  private scanRoot(dirPath: string, remainingDepth: number): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (remainingDepth > 0) {
            this.scanRoot(entryPath, remainingDepth - 1);
          }
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const stat = statSync(entryPath);
        if (Date.now() - stat.mtimeMs < INITIAL_SCAN_THRESHOLD_MS) {
          this.addFile(entryPath);
        }
      }
    } catch {
      /* root may not exist yet */
    }
  }

  private getSource(filePath: string): AgentSource | null {
    for (const root of WATCH_ROOTS) {
      if (filePath === root.path || filePath.startsWith(`${root.path}/`)) {
        return root.source;
      }
    }
    return null;
  }

  private readClaudeMetadata(filePath: string): Pick<WatchedFile, "sessionId" | "projectDir" | "projectName" | "currentWorkingDir"> {
    const sessionId = basename(filePath, ".jsonl");
    const projectDir = dirname(filePath);
    const projectDirName = basename(projectDir);
    const fallbackParts = projectDirName.split("-").filter(Boolean);
    const fallbackProjectName = fallbackParts[fallbackParts.length - 1] || sessionId.slice(0, 8);

    try {
      const stat = statSync(filePath);
      const headerLength = Math.min(stat.size, 24_576);
      const buffer = Buffer.alloc(headerLength);
      const fd = openSync(filePath, "r");
      readSync(fd, buffer, 0, buffer.length, 0);
      closeSync(fd);

      const lines = buffer.toString("utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const record = JSON.parse(trimmed) as { cwd?: unknown; message?: { cwd?: unknown } };
        const cwd = typeof record.cwd === "string"
          ? record.cwd
          : typeof record.message?.cwd === "string"
            ? record.message.cwd
            : null;
        if (cwd) {
          return {
            sessionId,
            projectDir,
            projectName: basename(cwd) || fallbackProjectName,
            currentWorkingDir: cwd,
          };
        }
      }
    } catch {
      /* fall back to encoded directory name */
    }

    return {
      sessionId,
      projectDir,
      projectName: fallbackProjectName,
      currentWorkingDir: null,
    };
  }

  private readCodexMetadata(filePath: string): Pick<WatchedFile, "sessionId" | "projectDir" | "projectName" | "currentWorkingDir"> {
    const fallbackSessionId = this.extractCodexSessionId(filePath);
    const fallbackProjectDir = dirname(filePath);

    try {
      const stat = statSync(filePath);
      const headerLength = Math.min(stat.size, 16_384);
      const buffer = Buffer.alloc(headerLength);
      const fd = openSync(filePath, "r");
      readSync(fd, buffer, 0, buffer.length, 0);
      closeSync(fd);

      const firstLine = buffer.toString("utf-8").split("\n")[0]?.trim();
      if (!firstLine) {
        throw new Error("missing session header");
      }

      const record = JSON.parse(firstLine) as { type?: string; payload?: Record<string, unknown> };
      const payload = record.payload ?? {};
      const sessionId = typeof payload.id === "string" ? payload.id : fallbackSessionId;
      const cwd = typeof payload.cwd === "string" ? payload.cwd : null;
      const projectDir = cwd ?? fallbackProjectDir;
      const projectName = cwd ? basename(cwd) || sessionId.slice(0, 8) : sessionId.slice(0, 8);

      return {
        sessionId,
        projectDir,
        projectName,
        currentWorkingDir: cwd,
      };
    } catch {
      return {
        sessionId: fallbackSessionId,
        projectDir: fallbackProjectDir,
        projectName: fallbackSessionId.slice(0, 8),
        currentWorkingDir: null,
      };
    }
  }

  private extractCodexSessionId(filePath: string): string {
    const fileName = basename(filePath, ".jsonl");
    const match = fileName.match(/([0-9a-f]{8,}(?:-[0-9a-f]{4,}){2,})$/i);
    return match?.[1] ?? fileName;
  }
}
