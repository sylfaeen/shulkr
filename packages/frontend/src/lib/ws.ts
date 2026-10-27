// Closes a WebSocket without triggering "WebSocket is closed before the connection is established" when called during the CONNECTING phase. The close is deferred to the next `open` event in that case.
export function safeCloseWebSocket(ws: WebSocket, code = 1000, reason?: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(code, reason);

    return;
  }

  if (ws.readyState === WebSocket.CONNECTING) {
    ws.addEventListener('open', () => ws.close(code, reason), { once: true });
  }
}
