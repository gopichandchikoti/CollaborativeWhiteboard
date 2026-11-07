import { WebSocket } from 'ws';

export const MAX_PEERS = 128;
export const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
interface OutputSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  terminate(): void;
}

/** Slow readers must reconnect from the durable snapshot instead of growing an unbounded send queue. */
export function sendBounded(socket: OutputSocket, data: string) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount + Buffer.byteLength(data) > MAX_BUFFER_BYTES) {
    socket.terminate();
    return false;
  }
  socket.send(data);
  return true;
}
