import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { MAX_BUFFER_BYTES, sendBounded } from '../src/collaboration/socket-policy';

it('bounds the entire queued message in bytes and disconnects slow readers before enqueueing', () => {
  const socket = { readyState: WebSocket.OPEN as number, bufferedAmount: 0, send: vi.fn(), terminate: vi.fn() };
  expect(sendBounded(socket, 'sync')).toBe(true);
  socket.bufferedAmount = MAX_BUFFER_BYTES - 1;
  expect(sendBounded(socket, 'é')).toBe(false);
  expect(socket.terminate).toHaveBeenCalledOnce();
  expect(socket.send).toHaveBeenCalledTimes(1);
  socket.bufferedAmount = 0;
  expect(sendBounded(socket, 'x'.repeat(MAX_BUFFER_BYTES + 1))).toBe(false);
  socket.readyState = WebSocket.CLOSED;
  expect(sendBounded(socket, 'sync')).toBe(false);
  expect(socket.send).toHaveBeenCalledTimes(1);
});
