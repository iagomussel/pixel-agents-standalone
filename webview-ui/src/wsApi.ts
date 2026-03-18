// WebSocket API — replaces VS Code postMessage bridge
const WS_URL = import.meta.env.DEV
  ? "ws://localhost:3456"
  : `ws://${window.location.host}`;

export const API_BASE = import.meta.env.DEV ? "http://localhost:3456" : "";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

export function onConnectionChange(fn: ConnectionListener): () => void {
  connectionListeners.add(fn);
  return () => connectionListeners.delete(fn);
}

function notifyConnection(connected: boolean): void {
  for (const fn of connectionListeners) fn(connected);
}

export function connectWebSocket(): void {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to pixel-agents server");
    notifyConnection(true);
    ws?.send(JSON.stringify({ type: "webviewReady" }));
  };

  ws.onmessage = (event) => {
    // Dispatch as window message to match upstream useExtensionMessages hook
    const data = JSON.parse(event.data);
    window.dispatchEvent(new MessageEvent("message", { data }));
  };

  ws.onclose = () => {
    notifyConnection(false);
    console.log("Disconnected, reconnecting in 2s...");
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => ws?.close();
}

export function sendMessage(msg: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function cleanup(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
}
